export type TimingInputAction = () => void;

export interface TimingInputController {
  register(button: HTMLButtonElement, action: TimingInputAction): void;
  unregister(button: HTMLButtonElement, action: TimingInputAction): void;
  handled(event: Event): boolean;
}

declare global {
  interface Window {
    __dpTimingInputController?: TimingInputController;
  }
}

// Static parser-time code: no callbacks, settings or user data are serialized.
// Only hydrated app buttons explicitly registered by useTimingInput can act.
export const TIMING_INPUT_BOOTSTRAP = `(() => {
  if (window.__dpTimingInputController) return;
  const actions = new WeakMap();
  const handled = new WeakSet();
  window.__dpTimingInputController = {
    register(button, action) {
      if (button instanceof HTMLButtonElement && typeof action === 'function') actions.set(button, action);
    },
    unregister(button, action) {
      if (actions.get(button) === action) actions.delete(button);
    },
    handled(event) { return handled.has(event); }
  };
  const dispatch = event => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!(button instanceof HTMLButtonElement) || !button.isConnected || button.disabled) return;
    const action = actions.get(button);
    if (!action || handled.has(event)) return;
    if (event.type === 'pointerdown') {
      if (!event.isPrimary || event.button !== 0) return;
    } else {
      if (document.activeElement !== button || !(event.code === 'Space' || event.key === 'Enter')) return;
      event.preventDefault();
      if (event.repeat) return;
    }
    event.preventDefault();
    handled.add(event);
    action();
  };
  window.addEventListener('pointerdown', dispatch, {capture: true, passive: false});
  window.addEventListener('keydown', dispatch, {capture: true, passive: false});
})();`;
