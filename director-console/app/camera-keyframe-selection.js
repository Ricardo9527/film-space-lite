export class CameraKeyframeSelection {
  owner = null;
  ids = new Set();
  anchorID = null;
  _activeID = null;

  get activeID() { return this._activeID; }
  set activeID(id) {
    this._activeID = id;
    this.anchorID = id;
    this.ids = new Set(id ? [id] : []);
  }

  activate(id) {
    if (this.ids.has(id)) this._activeID = id;
    else this.activeID = id;
  }

  sync(owner, keyframes) {
    if (this.owner !== owner) {
      this.owner = owner;
      this.activeID = this.activeID;
    }
    const valid = new Set(keyframes.map((key) => key.id));
    this.ids = new Set([...this.ids].filter((id) => valid.has(id)));
    if (!valid.has(this.anchorID)) this.anchorID = null;
  }

  select(keyframes, id, extend = false) {
    const anchor = keyframes.findIndex((key) => key.id === this.anchorID);
    const target = keyframes.findIndex((key) => key.id === id);
    if (extend && anchor >= 0 && target >= 0) {
      this.ids = new Set(keyframes.slice(Math.min(anchor, target), Math.max(anchor, target) + 1).map((key) => key.id));
      this._activeID = id;
    } else {
      this.activeID = id;
    }
  }
}
