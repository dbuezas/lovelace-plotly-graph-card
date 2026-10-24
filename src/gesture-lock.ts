type ScrollNode = Element | Document;

export class GestureLock {
  private enabled = false;
  private locked = true;
  private showing = false;
  private fingers = 0;
  private hideTimer?: ReturnType<typeof setTimeout>;
  private attemptTimer?: ReturnType<typeof setTimeout>;
  private scrollNodes: ScrollNode[] = [];
  private attempt?: {
    kind: "touch" | "wheel";
    positions: Map<ScrollNode, number>;
    shown: boolean;
  };
  private button: HTMLButtonElement;
  private label: HTMLElement;
  private hint: HTMLElement;

  constructor(
    private plot: HTMLElement,
    private root: HTMLElement,
    private onToggle: () => void,
  ) {
    this.button = root.querySelector("button")!;
    this.label = this.button.querySelector("span")!;
    this.hint = root.querySelector("[role=status]")!;
  }

  update(enabled: boolean, locked: boolean) {
    if (enabled !== this.enabled || locked !== this.locked) {
      this.clearAttempt();
      this.hide();
    }
    this.enabled = enabled;
    this.locked = locked;
    this.label.textContent = locked ? "Unlock" : "Lock";
    this.button.setAttribute(
      "aria-label",
      locked ? "Unlock chart" : "Lock chart",
    );
    this.root.classList.toggle("unlocked", !locked);
    this.render();
  }

  private render() {
    this.root.hidden = !this.enabled || (this.locked && !this.showing);
    this.hint.hidden = !this.locked;
    this.button.disabled = this.locked && this.fingers > 0;
  }
  private hide = () => {
    clearTimeout(this.hideTimer);
    this.showing = false;
    this.render();
  };
  private hideLater = () => {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(this.hide, 2000);
  };
  private clearAttempt = () => {
    clearTimeout(this.attemptTimer);
    this.attempt = undefined;
  };
  private scrollTop(node: ScrollNode) {
    return (
      (node instanceof Document ? node.scrollingElement : node)?.scrollTop ?? 0
    );
  }
  private startAttempt(kind: "touch" | "wheel") {
    this.clearAttempt();
    this.attempt = {
      kind,
      positions: new Map(
        this.scrollNodes.map((node) => [node, this.scrollTop(node)]),
      ),
      shown: false,
    };
  }
  private expireAttempt() {
    clearTimeout(this.attemptTimer);
    this.attemptTimer = setTimeout(this.clearAttempt, 500);
  }
  private onScroll = (event: Event) => {
    if (!this.enabled || !this.locked) return;
    const node = event.currentTarget as ScrollNode;
    const start = this.attempt?.positions.get(node);
    if (start === undefined || Math.abs(this.scrollTop(node) - start) < 6)
      return;
    if (!this.attempt!.shown) {
      this.attempt!.shown = true;
      const modifier = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
        ? "Cmd"
        : "Ctrl";
      this.hint.textContent =
        this.attempt!.kind === "touch"
          ? "Use two fingers to interact"
          : `Hold ${modifier} to zoom`;
      this.showing = true;
      this.render();
    }
    if (!this.fingers) this.hideLater();
  };
  private onInput = (event: TouchEvent | WheelEvent) => {
    if (!this.enabled || !this.locked) return;
    if ("touches" in event) {
      this.fingers = event.touches.length;
      this.hide();
      this.clearAttempt();
      if (this.fingers === 1) this.startAttempt("touch");
    } else if (!event.ctrlKey && !event.metaKey) {
      if (this.attempt?.kind !== "wheel") this.startAttempt("wheel");
      this.expireAttempt();
    } else {
      this.clearAttempt();
      this.hide();
    }
  };
  private onEnd = (event: TouchEvent) => {
    this.fingers = event.type === "touchcancel" ? 0 : event.touches.length;
    this.render();
    if (!this.fingers) {
      if (this.showing) this.hideLater();
      this.expireAttempt();
    }
  };
  private onPointer = (event: PointerEvent) => {
    if (event.pointerType !== "touch") {
      this.clearAttempt();
      this.hide();
    }
  };
  private onClick = () => {
    this.clearAttempt();
    this.onToggle();
  };
  private keepVisible = () => clearTimeout(this.hideTimer);

  connect() {
    this.disconnect();
    // Scroll does not bubble through HA's shadow roots. Listen to each ancestor
    // itself, so a hint only appears when the enclosing dashboard actually moves.
    for (
      let node: Node | null = this.plot;
      node;
      node = node instanceof ShadowRoot ? node.host : node.parentNode
    ) {
      if (node instanceof Element || node instanceof Document) {
        this.scrollNodes.push(node);
        node.addEventListener("scroll", this.onScroll, { passive: true });
      }
    }
    this.plot.addEventListener("touchstart", this.onInput, {
      capture: true,
      passive: true,
    });
    this.plot.addEventListener("wheel", this.onInput, {
      capture: true,
      passive: true,
    });
    this.plot.addEventListener("pointerdown", this.onPointer, {
      passive: true,
    });
    this.plot.addEventListener("touchend", this.onEnd, {
      capture: true,
      passive: true,
    });
    this.plot.addEventListener("touchcancel", this.onEnd, {
      capture: true,
      passive: true,
    });
    this.button.addEventListener("click", this.onClick);
    this.button.addEventListener("pointerdown", this.keepVisible);
    this.root.addEventListener("pointerenter", this.keepVisible);
    this.root.addEventListener("pointerleave", this.hideLater);
    this.root.addEventListener("focusin", this.keepVisible);
    this.root.addEventListener("focusout", this.hideLater);
  }
  disconnect() {
    this.clearAttempt();
    this.fingers = 0;
    this.hide();
    for (const node of this.scrollNodes)
      node.removeEventListener("scroll", this.onScroll);
    this.scrollNodes = [];
    this.plot.removeEventListener("touchstart", this.onInput, true);
    this.plot.removeEventListener("wheel", this.onInput, true);
    this.plot.removeEventListener("pointerdown", this.onPointer);
    this.plot.removeEventListener("touchend", this.onEnd, true);
    this.plot.removeEventListener("touchcancel", this.onEnd, true);
    this.button.removeEventListener("click", this.onClick);
    this.button.removeEventListener("pointerdown", this.keepVisible);
    this.root.removeEventListener("pointerenter", this.keepVisible);
    this.root.removeEventListener("pointerleave", this.hideLater);
    this.root.removeEventListener("focusin", this.keepVisible);
    this.root.removeEventListener("focusout", this.hideLater);
  }
}
