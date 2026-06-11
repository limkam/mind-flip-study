// Inspired by react-hot-toast library
import { useState, useEffect } from "react";

const TOAST_LIMIT = 3;
const TOAST_DURATION = 2000;
const TOAST_REMOVE_DELAY = 300;

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
};

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_VALUE;
  return count.toString();
}

const toastTimeouts = new Map();
const dismissTimeouts = new Map();

const addToRemoveQueue = (toastId) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: actionTypes.REMOVE_TOAST,
      toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

const clearDismissTimeout = (toastId) => {
  const timeout = dismissTimeouts.get(toastId);
  if (timeout) {
    clearTimeout(timeout);
    dismissTimeouts.delete(toastId);
  }
};

const scheduleAutoDismiss = (toastId, duration) => {
  clearDismissTimeout(toastId);
  const timeout = setTimeout(() => {
    dismissTimeouts.delete(toastId);
    dispatch({ type: actionTypes.DISMISS_TOAST, toastId });
  }, duration);
  dismissTimeouts.set(toastId, timeout);
};

export const reducer = (state, action) => {
  switch (action.type) {
    case actionTypes.ADD_TOAST:
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case actionTypes.UPDATE_TOAST:
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case actionTypes.DISMISS_TOAST: {
      const { toastId } = action;

      if (toastId) {
        clearDismissTimeout(toastId);
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          clearDismissTimeout(toast.id);
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      };
    }
    case actionTypes.REMOVE_TOAST:
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      clearDismissTimeout(action.toastId);
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

const listeners = [];

let memoryState = { toasts: [] };

function dispatch(action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

/**
 * @param {object} props
 * @param {number} [props.duration]
 * @param {string} [props.dedupeKey]
 * @param {string} [props.title]
 * @param {string} [props.description]
 * @param {string} [props.variant]
 */
function toast({ duration = TOAST_DURATION, dedupeKey, ...props }) {
  const key = dedupeKey ?? props.title;
  if (key) {
    const existing = memoryState.toasts.find(
      (t) => t.dedupeKey === key && t.open !== false
    );
    if (existing) {
      dispatch({
        type: actionTypes.UPDATE_TOAST,
        toast: { ...props, id: existing.id, open: true, dedupeKey: key },
      });
      scheduleAutoDismiss(existing.id, duration);
      const dismiss = () =>
        dispatch({ type: actionTypes.DISMISS_TOAST, toastId: existing.id });
      return {
        id: existing.id,
        dismiss,
        update: (updateProps) =>
          dispatch({
            type: actionTypes.UPDATE_TOAST,
            toast: { ...updateProps, id: existing.id },
          }),
      };
    }
  }

  const id = genId();

  const update = (updateProps) =>
    dispatch({
      type: actionTypes.UPDATE_TOAST,
      toast: { ...updateProps, id },
    });

  const dismiss = () =>
    dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id });

  dispatch({
    type: actionTypes.ADD_TOAST,
    toast: {
      ...props,
      id,
      dedupeKey: key,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  scheduleAutoDismiss(id, duration);

  return {
    id,
    dismiss,
    update,
  };
}

function useToast() {
  const [state, setState] = useState(memoryState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId) => dispatch({ type: actionTypes.DISMISS_TOAST, toastId }),
  };
}

export { useToast, toast };
