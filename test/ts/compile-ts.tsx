import * as React from "react"
import * as ReactDOM from "react-dom"
import { Component } from "react"
import * as ClassicPropTypes from "prop-types"
import {
    observer,
    Provider,
    inject,
    Observer,
    disposeOnUnmount,
    PropTypes,
    useLocalStore
} from "../../src"
import * as createClass from "create-react-class"

@observer
class T1 extends Component<{ pizza: number }, {}> {
    render() {
        return <div>{this.props.pizza}</div>
    }
}

const T2 = observer(
    createClass({
        getDefaultProps() {
            return { cake: 7 }
        },
        render() {
            return (
                <div>
                    <T1 pizza={this.props.cake} />
                </div>
            )
        },
        propTypes: {
            zoem: PropTypes.arrayOrObservableArray
        }
    })
)

const T3 = observer((props: { hamburger: number }) => {
    return <T2 cake={props.hamburger} />
})

const T4 = ({ sandwich }: { sandwich: number }) => (
    <div>
        <T3 hamburger={sandwich} />
    </div>
)

const T5 = observer(() => {
    return <T3 hamburger={17} />
})

@observer
class T6 extends Component<{}, {}> {
    render() {
        return (
            <span>
                <T3 hamburger={6} />
                {/* doesn't work with tsc 1.7.5: https://github.com/Microsoft/TypeScript/issues/5675 */}
                {/*<T4 sandwich={5} />*/}
                <T5 />
            </span>
        )
    }
}

const x = React.createElement(T3, { hamburger: 4 })

class T7 extends Component<{ pizza: number }, {}> {
    render() {
        return <div>{this.props.pizza}</div>
    }
}
React.createElement(observer(T7), { pizza: 4 })

ReactDOM.render(<T5 />, document.body)

class ProviderTest extends Component<any, any> {
    render() {
        return (
            <Provider foo={32}>
                <div>hi</div>
            </Provider>
        )
    }
}

@inject(() => ({ x: 3 }))
class T11 extends Component<{ pizza: number; x?: number }, {}> {
    render() {
        return (
            <div>
                {this.props.pizza}
                {this.props.x}
            </div>
        )
    }
}

class T15 extends Component<{ pizza: number; x?: number }, {}> {
    render() {
        return (
            <div>
                {this.props.pizza}
                {this.props.x}
            </div>
        )
    }
}
const T16 = inject(() => ({ x: 3 }))(T15)

class T17 extends Component<{}, {}> {
    render() {
        return (
            <div>
                <T11 pizza={3} x={1} />
                <T15 pizza={3} x={1} />
                <T16 pizza={4} x={2} />
                <T11 pizza={3} />
                <T15 pizza={3} />
                <T16 pizza={4} />
            </div>
        )
    }
}

@inject("a", "b")
class T12 extends Component<{ pizza: number }, {}> {
    render() {
        return <div>{this.props.pizza}</div>
    }
}

@inject("a", "b")
@observer
class T13 extends Component<{ pizza: number }, {}> {
    render() {
        return <div>{this.props.pizza}</div>
    }
}

const LoginContainer = inject((allStores, props) => ({
    store: { y: true, z: 2 },
    z: 7
}))(
    observer(
        class _LoginContainer extends Component<
            {
                x: string
                store?: { y: boolean; z: number }
            },
            {}
        > {
            static contextTypes: React.ValidationMap<any> = {
                router: ClassicPropTypes.func.isRequired
            }

            render() {
                return (
                    <div>
                        Hello!
                        {this.props.x}
                        {this.props.store!.y}
                    </div>
                )
            }
        }
    )
)
ReactDOM.render(<LoginContainer x="test" />, document.body)

@inject(allStores => ({
    store: { y: true, z: 2 }
}))
@observer
class LoginContainer2 extends Component<
    {
        x: string
        store?: { y: boolean }
    },
    {}
> {
    static contextTypes: React.ValidationMap<any> = {
        router: ClassicPropTypes.func.isRequired
    }

    render() {
        return (
            <div>
                Hello!
                {this.props.x}
                {this.props.store!.y}
            </div>
        )
    }
}

ReactDOM.render(<LoginContainer2 x="test" />, document.body)

class ObserverTest extends Component<any, any> {
    render() {
        return <Observer>{() => <div>test</div>}</Observer>
    }
}

class ObserverTest2 extends Component<any, any> {
    render() {
        return <Observer render={() => <div>test</div>} />
    }
}

@observer
class ComponentWithoutPropsAndState extends Component<{}, {}> {
    componentDidUpdate() {}

    render() {
        return <div>Hello!</div>
    }
}

const AppInner = observer((props: { a: number }) => {
    return (
        <div>
            <h1>Hello</h1>
            {props.a}
        </div>
    )
})

const App = inject("store")(AppInner)

App.wrappedComponent

@inject("store")
@observer
class App2 extends Component<{ a: number }, {}> {}

class InjectSomeStores extends Component<{ x: any }, {}> {
    render() {
        return <div>Hello World</div>
    }
}

inject(({ x }) => ({ x }))(InjectSomeStores)

{
    class T extends Component<{ x: number }> {
        render() {
            return <div />
        }
    }

    const Injected = inject("test")(T)
    ;<Injected.wrappedComponent x={3} />
}

{
    // just to make sure it compiles
    class DisposeOnUnmountComponent extends Component<{}> {
        @disposeOnUnmount
        methodA = () => {}

        methodB = disposeOnUnmount(this, () => {})
        manyMethods = disposeOnUnmount(this, [() => {}, () => {}])
    }

    // manual tests: this should not compile when the decorator is not applied over a react component class
    /*
    class DisposeOnUnmountNotAComponent {
        @disposeOnUnmount
        methodA = () => {}

        methodB = disposeOnUnmount(this, () => {})
    }
    */
}

{
    const TestComponent = () => {
        const observable = useLocalStore(() => ({
            test: 3
        }))

        return <h1>{observable.test * 2}</h1>
    }
    ;<TestComponent />
}
