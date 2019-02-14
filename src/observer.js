import React, { Component, PureComponent, forwardRef } from "react"
import hoistStatics from "hoist-non-react-statics"
import { createAtom, Reaction, _allowStateChanges, $mobx } from "mobx"
import { findDOMNode as baseFindDOMNode } from "react-dom"
import {
    observer as observerLite,
    useStaticRendering as useStaticRenderingLite,
    Observer
} from "mobx-react-lite"

import EventEmitter from "./utils/EventEmitter"
import { patch as newPatch, newSymbol, shallowEqual } from "./utils/utils"

const mobxAdminProperty = $mobx || "$mobx"
const mobxIsUnmounted = newSymbol("isUnmounted")

/**
 * dev tool support
 */
let isDevtoolsEnabled = false

let isUsingStaticRendering = false

// WeakMap<Node, Object>;
export const componentByNodeRegistry = typeof WeakMap !== "undefined" ? new WeakMap() : undefined
export const renderReporter = new EventEmitter()

const skipRenderKey = newSymbol("skipRender")
const isForcingUpdateKey = newSymbol("isForcingUpdate")

// Using react-is had some issues (and operates on elements, not on types), see #608 / #609
const ReactForwardRefSymbol =
    typeof forwardRef === "function" && forwardRef((_props, _ref) => {})["$$typeof"]

/**
 * Helper to set `prop` to `this` as non-enumerable (hidden prop)
 * @param target
 * @param prop
 * @param value
 */
function setHiddenProp(target, prop, value) {
    if (!Object.hasOwnProperty.call(target, prop)) {
        Object.defineProperty(target, prop, {
            enumerable: false,
            configurable: true,
            writable: true,
            value
        })
    } else {
        target[prop] = value
    }
}

function findDOMNode(component) {
    if (baseFindDOMNode) {
        try {
            return baseFindDOMNode(component)
        } catch (e) {
            // findDOMNode will throw in react-test-renderer, see:
            // See https://github.com/mobxjs/mobx-react/issues/216
            // Is there a better heuristic?
            return null
        }
    }
    return null
}

function reportRendering(component) {
    const node = findDOMNode(component)
    if (node && componentByNodeRegistry) componentByNodeRegistry.set(node, component)

    renderReporter.emit({
        event: "render",
        renderTime: component.__$mobRenderEnd - component.__$mobRenderStart,
        totalTime: Date.now() - component.__$mobRenderStart,
        component: component,
        node: node
    })
}

export function trackComponents() {
    if (typeof WeakMap === "undefined")
        throw new Error("[mobx-react] tracking components is not supported in this browser.")
    if (!isDevtoolsEnabled) isDevtoolsEnabled = true
}

export function useStaticRendering(useStaticRendering) {
    isUsingStaticRendering = useStaticRendering
    useStaticRenderingLite(useStaticRendering)
}

/**
 * Errors reporter
 */

export const errorsReporter = new EventEmitter()

/**
 * Utilities
 */

function patch(target, funcName) {
    newPatch(target, funcName, reactiveMixin[funcName])
}

function makeComponentReactive(render) {
    if (isUsingStaticRendering === true) return render.call(this)

    function reactiveRender() {
        isRenderingPending = false
        let exception = undefined
        let rendering = undefined
        reaction.track(() => {
            if (isDevtoolsEnabled) {
                this.__$mobRenderStart = Date.now()
            }
            try {
                rendering = _allowStateChanges(false, baseRender)
            } catch (e) {
                exception = e
            }
            if (isDevtoolsEnabled) {
                this.__$mobRenderEnd = Date.now()
            }
        })
        if (exception) {
            reaction.dispose()
            errorsReporter.emit(exception)
            throw exception
        }
        return rendering
    }

    // Generate friendly name for debugging
    const initialName =
        this.displayName ||
        this.name ||
        (this.constructor && (this.constructor.displayName || this.constructor.name)) ||
        "<component>"
    const rootNodeID =
        (this._reactInternalInstance && this._reactInternalInstance._rootNodeID) ||
        (this._reactInternalInstance && this._reactInternalInstance._debugID) ||
        (this._reactInternalFiber && this._reactInternalFiber._debugID)
    /**
     * If props are shallowly modified, react will render anyway,
     * so atom.reportChanged() should not result in yet another re-render
     */
    setHiddenProp(this, skipRenderKey, false)
    /**
     * forceUpdate will re-assign this.props. We don't want that to cause a loop,
     * so detect these changes
     */
    setHiddenProp(this, isForcingUpdateKey, false)

    // wire up reactive render
    const baseRender = render.bind(this)
    let isRenderingPending = false

    const reaction = new Reaction(`${initialName}#${rootNodeID}.render()`, () => {
        if (!isRenderingPending) {
            // N.B. Getting here *before mounting* means that a component constructor has side effects (see the relevant test in misc.js)
            // This unidiomatic React usage but React will correctly warn about this so we continue as usual
            // See #85 / Pull #44
            isRenderingPending = true
            if (typeof this.componentWillReact === "function") this.componentWillReact() // TODO: wrap in action?
            if (this[mobxIsUnmounted] !== true) {
                // If we are unmounted at this point, componentWillReact() had a side effect causing the component to unmounted
                // TODO: remove this check? Then react will properly warn about the fact that this should not happen? See #73
                // However, people also claim this might happen during unit tests..
                let hasError = true
                try {
                    setHiddenProp(this, isForcingUpdateKey, true)
                    if (!this[skipRenderKey]) Component.prototype.forceUpdate.call(this)
                    hasError = false
                } finally {
                    setHiddenProp(this, isForcingUpdateKey, false)
                    if (hasError) reaction.dispose()
                }
            }
        }
    })
    reaction.reactComponent = this
    reactiveRender[mobxAdminProperty] = reaction
    this.render = reactiveRender
    return reactiveRender.call(this)
}

/**
 * ReactiveMixin
 */
const reactiveMixin = {
    componentWillUnmount: function() {
        if (isUsingStaticRendering === true) return
        this.render[mobxAdminProperty] && this.render[mobxAdminProperty].dispose()
        this[mobxIsUnmounted] = true
        if (isDevtoolsEnabled) {
            const node = findDOMNode(this)
            if (node && componentByNodeRegistry) {
                componentByNodeRegistry.delete(node)
            }
            renderReporter.emit({
                event: "destroy",
                component: this,
                node: node
            })
        }
    },

    componentDidMount: function() {
        if (isDevtoolsEnabled) {
            reportRendering(this)
        }
    },

    componentDidUpdate: function() {
        if (isDevtoolsEnabled) {
            reportRendering(this)
        }
    },

    shouldComponentUpdate: function(nextProps, nextState) {
        if (isUsingStaticRendering) {
            console.warn(
                "[mobx-react] It seems that a re-rendering of a React component is triggered while in static (server-side) mode. Please make sure components are rendered only once server-side."
            )
        }
        // update on any state changes (as is the default)
        if (this.state !== nextState) {
            return true
        }
        // update if props are shallowly not equal, inspired by PureRenderMixin
        // we could return just 'false' here, and avoid the `skipRender` checks etc
        // however, it is nicer if lifecycle events are triggered like usually,
        // so we return true here if props are shallowly modified.
        return !shallowEqual(this.props, nextProps)
    }
}

function makeObservableProp(target, propName) {
    const valueHolderKey = newSymbol(`reactProp_${propName}_valueHolder`)
    const atomHolderKey = newSymbol(`reactProp_${propName}_atomHolder`)
    function getAtom() {
        if (!this[atomHolderKey]) {
            setHiddenProp(this, atomHolderKey, createAtom("reactive " + propName))
        }
        return this[atomHolderKey]
    }
    Object.defineProperty(target, propName, {
        configurable: true,
        enumerable: true,
        get: function() {
            getAtom.call(this).reportObserved()
            return this[valueHolderKey]
        },
        set: function set(v) {
            if (!this[isForcingUpdateKey] && !shallowEqual(this[valueHolderKey], v)) {
                setHiddenProp(this, valueHolderKey, v)
                setHiddenProp(this, skipRenderKey, true)
                getAtom.call(this).reportChanged()
                setHiddenProp(this, skipRenderKey, false)
            } else {
                setHiddenProp(this, valueHolderKey, v)
            }
        }
    })
}

/**
 * Observer function / decorator
 */
export function observer(componentClass) {
    if (componentClass.isMobxInjector === true) {
        console.warn(
            "Mobx observer: You are trying to use 'observer' on a component that already has 'inject'. Please apply 'observer' before applying 'inject'"
        )
    }
    if (componentClass.__proto__ === PureComponent) {
        console.warn(
            "Mobx observer: You are using 'observer' on React.PureComponent. These two achieve two opposite goals and should not be used together"
        )
    }

    // Unwrap forward refs into `<Observer>` component
    // we need to unwrap the render, because it is the inner render that needs to be tracked,
    // not the ForwardRef HoC
    if (ReactForwardRefSymbol && componentClass["$$typeof"] === ReactForwardRefSymbol) {
        const baseRender = componentClass.render
        if (typeof baseRender !== "function")
            throw new Error("render property of ForwardRef was not a function")
        // TODO: do we need to hoist statics from baseRender to the forward ref?
        return forwardRef(function ObserverForwardRef() {
            return <Observer>{() => baseRender.apply(undefined, arguments)}</Observer>
        })
    }

    // Stateless function component:
    // If it is function but doesn't seem to be a react class constructor,
    // wrap it to a react class automatically
    if (
        typeof componentClass === "function" &&
        (!componentClass.prototype || !componentClass.prototype.render) &&
        !componentClass.isReactClass &&
        !Component.isPrototypeOf(componentClass)
    ) {
        const observerComponent = observerLite(componentClass)
        // TODO: move to mobx-react-lite
        // TODO: static hoisting is not needed?
        hoistStatics(observerComponent, componentClass)
        if (componentClass.propTypes) observerComponent.propTypes = componentClass.propTypes
        if (componentClass.defaultProps)
            observerComponent.defaultProps = componentClass.defaultProps
        observerComponent.isMobXReactObserver = true
        return observerComponent
    }

    if (!componentClass) {
        throw new Error("Please pass a valid component to 'observer'")
    }

    const target = componentClass.prototype || componentClass
    mixinLifecycleEvents(target)
    componentClass.isMobXReactObserver = true
    makeObservableProp(target, "props")
    makeObservableProp(target, "state")
    const baseRender = target.render
    target.render = function() {
        return makeComponentReactive.call(this, baseRender)
    }
    return componentClass
}

function mixinLifecycleEvents(target) {
    ;["componentDidMount", "componentWillUnmount", "componentDidUpdate"].forEach(function(
        funcName
    ) {
        patch(target, funcName)
    })
    if (!target.shouldComponentUpdate) {
        target.shouldComponentUpdate = reactiveMixin.shouldComponentUpdate
    } else {
        if (target.shouldComponentUpdate !== reactiveMixin.shouldComponentUpdate) {
            // TODO: make throw in next major
            console.warn(
                "Use `shouldComponentUpdate` in an `observer` based component breaks the behavior of `observer` and might lead to unexpected results. Manually implementing `sCU` should not be needed when using mobx-react."
            )
        }
    }
}
