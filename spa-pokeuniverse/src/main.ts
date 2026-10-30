import "./styles/app.css";
import { registerSW } from "virtual:pwa-register";
import { startApp } from "./app/app";

registerSW({ immediate: true });
void startApp(document.getElementById("app")!);
