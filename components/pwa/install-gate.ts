/**
 * Holds the "how to install" dialog back until the account menu that asked for
 * it has finished closing.
 *
 * A Radix menu that is still closing and a new modal dialog both want the focus
 * and <body>'s pointer events. Opened in the same breath, they can leave the
 * page unclickable (`pointer-events: none` on <body>) or the dialog impossible
 * to focus. The menu's `onCloseAutoFocus` fires only once its content is gone,
 * so that is the moment the dialog is opened.
 */
export function createInstructionsGate(open: () => void) {
  let waiting = false;
  return {
    /** A menu item asked for the dialog: open it as soon as that menu has closed. */
    request() {
      waiting = true;
    },
    /** Wire to the menu content's `onCloseAutoFocus`. Does nothing unless a request is waiting. */
    menuClosed(event: Pick<Event, "preventDefault">) {
      if (!waiting) return;
      waiting = false;
      // Focus belongs to the dialog now, not back on the menu button.
      event.preventDefault();
      open();
    },
  };
}
