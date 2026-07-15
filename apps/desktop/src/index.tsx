/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";
import { installAppErrorReporting } from "./platform/error-reporting";

installAppErrorReporting();
render(() => <App />, document.getElementById("root") as HTMLElement);
