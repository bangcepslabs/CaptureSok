// Annotation state is independent of canvas pixels so items remain editable.
export function createAnnotationDocument(items = []) {
  let entries = structuredClone(items), undo = [], redo = [];
  const snapshot = () => structuredClone(entries);
  function change(fn) {
    undo.push(snapshot());
    if (undo.length > 100) undo.shift();
    redo = [];
    fn();
  }
  return {
    list: () => snapshot(),
    add(item) {
      const entry = structuredClone(item);
      if (!entry.id || entries.some(existing => existing.id === entry.id)) throw Error('invalid annotation id');
      change(() => entries.push(entry));
    },
    update(id, changes) {
      const index = entries.findIndex(item => item.id === id);
      if (index < 0) return false;
      change(() => { entries[index] = { ...entries[index], ...structuredClone(changes), id }; });
      return true;
    },
    remove(id) {
      const index = entries.findIndex(item => item.id === id);
      if (index < 0) return false;
      change(() => entries.splice(index, 1));
      return true;
    },
    undo() { if (!undo.length) return false; redo.push(snapshot()); entries = undo.pop(); return true; },
    redo() { if (!redo.length) return false; undo.push(snapshot()); entries = redo.pop(); return true; },
    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0,
    replace(items) {
      const replacement = structuredClone(items);
      change(() => { entries = replacement; });
    },
    crop(x, y, width, height) {
      if (![x,y,width,height].every(Number.isFinite) || width <= 0 || height <= 0) throw Error('invalid crop');
      change(() => {
        entries = entries
          .filter(item => item.x + item.width > x && item.y + item.height > y && item.x < x + width && item.y < y + height)
          .map(item => ({...item, x:item.x-x, y:item.y-y}));
      });
    }
  };
}

export function annotationAt(items, x, y, tolerance = 0) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (x >= item.x - tolerance && y >= item.y - tolerance && x <= item.x + item.width + tolerance && y <= item.y + item.height + tolerance) return item;
  }
  return null;
}

export function renderAnnotations(ctx, items) {
  for (const item of items) {
    ctx.save();
    if (item.type === 'rect') {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.lineWidth;
      ctx.strokeRect(item.x, item.y, item.width, item.height);
    } else if (item.type === 'text') {
      ctx.fillStyle = item.color;
      ctx.font = `${item.bold ? 'bold ' : ''}${item.fontSize}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.textAlign = item.align || 'left';
      const anchor = item.x + (item.align === 'center' ? item.width / 2 : item.align === 'right' ? item.width : 0);
      ctx.fillText(item.text, anchor, item.y);
      if (item.underline) ctx.fillRect(item.x, item.y + item.fontSize, item.width, Math.max(1, item.fontSize / 16));
    }
    ctx.restore();
  }
}
