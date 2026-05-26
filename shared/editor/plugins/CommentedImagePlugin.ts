import type { Node } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { changedDescendants } from "../lib/changedDescendants";
import { isRemoteTransaction } from "../lib/multiplayer";

/**
 * Plugin that applies a light outline decoration to media nodes that have
 * comment marks, providing a visual indicator that the node has been commented
 * on.
 */
export class CommentedImagePlugin extends Plugin {
  constructor() {
    super({
      state: {
        init: (_, state: EditorState) => ({
          decorations: this.createDecorations(state),
        }),
        apply: (tr, pluginState, _oldState, newState) => {
          if (!tr.docChanged) {
            return pluginState;
          }

          if (isRemoteTransaction(tr) || this.hasImageChange(tr)) {
            return { decorations: this.createDecorations(newState) };
          }

          return {
            decorations: pluginState.decorations.map(tr.mapping, tr.doc),
          };
        },
      },
      props: {
        decorations: (state) => {
          const pluginState = this.getState(state);
          return pluginState ? pluginState.decorations : null;
        },
      },
    });
  }

  /**
   * Check if the transaction added, removed, or modified any commentable media nodes.
   */
  private hasImageChange(tr: Transaction): boolean {
    let found = false;
    const check = (node: Node) => {
      if (!found && isCommentableMediaNode(node)) {
        found = true;
      }
    };

    changedDescendants(tr.before, tr.doc, 0, check);
    if (!found) {
      changedDescendants(tr.doc, tr.before, 0, check);
    }
    return found;
  }

  private createDecorations(state: EditorState) {
    const decorations: Decoration[] = [];

    state.doc.descendants((node, pos) => {
      if (
        isCommentableMediaNode(node) &&
        Array.isArray(node.attrs.marks) &&
        node.attrs.marks.some(
          (mark: { type: string; attrs?: { resolved?: boolean } }) =>
            mark.type === "comment" && !mark.attrs?.resolved
        )
      ) {
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: "image-commented",
          })
        );
      }
    });

    return DecorationSet.create(state.doc, decorations);
  }
}

export const commentedImagePlugin = () => new CommentedImagePlugin();

function isCommentableMediaNode(node: Node) {
  return node.type.name === "image" || node.type.name === "attachment";
}
