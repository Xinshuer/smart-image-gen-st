// Character anchor — when a contact has been "locked", reuse the same
// (anchor prompt, seed) for every subsequent image of that character so
// hair/eyes/face stay consistent across messages.

// Resolves the relevant contact for a given <pic> generation context.
// Strategy:
//   1. If the contact is explicitly named in the surrounding YAML payload (from field), use that.
//   2. Otherwise, scan the AI prompt for any contact name as substring.
//   3. Fallback: null (no anchor, generate fresh).

export function resolveContact(picTag, contacts, hint = {}) {
    if (hint.from) {
        // Exact match
        const exact = contacts.find((c) => c.name === hint.from);
        if (exact) return exact;
        // Fuzzy: contact name is substring of hint (handles emoji suffix, e.g. "笑到渡劫😂" contains "笑到渡劫")
        const sub1 = contacts.find((c) => c.name && hint.from.includes(c.name));
        if (sub1) return sub1;
        // Fuzzy: hint is substring of contact name (handles truncation)
        const sub2 = contacts.find((c) => c.name && c.name.includes(hint.from));
        if (sub2) return sub2;
    }
    // Fallback: scan tag content and post context for known names
    for (const c of contacts) {
        if (c.name && (picTag.includes(c.name) || (hint.context || '').includes(c.name))) {
            return c;
        }
    }
    return null;
}

export function getAnchorBundle(contact) {
    if (!contact?.anchor) return { prompt: '', sdPrompt: '', seed: null, locked: false };
    return {
        prompt: contact.anchor.prompt || '',
        sdPrompt: contact.anchor.sdPrompt || '',
        seed: contact.anchor.locked ? contact.anchor.seed : null,
        locked: !!contact.anchor.locked,
    };
}
