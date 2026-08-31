export function afterAuthUrl(): string {
  return window.self === window.top ? '/' : '/embed';
}
