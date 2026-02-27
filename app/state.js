export function createStore(initialState) {
  let currentState = initialState;
  const listeners = new Set();

  return {
    getState() {
      return currentState;
    },
    setState(nextState) {
      currentState = nextState;
      listeners.forEach((listener) => listener(currentState));
    },
    patch(partialState) {
      currentState = {
        ...currentState,
        ...partialState,
      };
      listeners.forEach((listener) => listener(currentState));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
