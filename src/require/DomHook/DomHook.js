class DomHook {
    constructor(selector, isSubtree, callback) {
        this.selector = selector;
        this.isSubtree = isSubtree;
        this.callback = callback;
        this.target = null;
        this.closed = false;
        this.observer = new MutationObserver((mutations) => {
            if (!this.closed) this.callback(mutations);
        });
        this.bindTarget(false);
        this.rootObserver = new MutationObserver((mutations) => {
            // Most class changes (for example scrolling barrage items) cannot
            // affect an already matched host. Avoid a global query for those.
            const childrenChanged = mutations.some((mutation) => mutation.type === "childList");
            const targetLost = !this.target || !this.target.isConnected || !this.target.matches(this.selector);
            const candidateChanged = mutations.some((mutation) => mutation.type === "attributes" && mutation.target.matches(this.selector));
            if (childrenChanged || targetLost || candidateChanged) this.bindTarget(true);
        });
        this.rootObserver.observe(document.documentElement, {
            childList: true, subtree: true, attributes: true, attributeFilter: ["class", "id"],
        });
    }

    bindTarget(notify) {
        if (this.closed) return;
        const target = document.querySelector(this.selector);
        if (target === this.target) return;
        this.observer.disconnect();
        this.target = target;
        if (!target) return;
        this.observer.observe(target, { attributes: true, childList: true, subtree: this.isSubtree });
        // A replacement can arrive with its children already rendered.
        if (notify) this.callback([{ type: "childList", target, addedNodes: Array.from(target.childNodes), removedNodes: [] }]);
    }

    closeHook() {
        this.closed = true;
        this.observer.disconnect();
        this.rootObserver.disconnect();
        this.target = null;
    }
}
