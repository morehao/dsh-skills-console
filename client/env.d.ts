// 由宿主 __ModuleLoader__ 的 factory(require) 注入；客户端源码里唯一的裸 require 是 react-dom。
declare const require: (id: string) => unknown;

interface Window {
  __ModuleLoader__?: { load: (spec: unknown) => void };
}
