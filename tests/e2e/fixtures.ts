import type { Board, BoardCollection } from "../../src/domain/types";

const titles = [
  "Refine the board navigation", "Map the empty-state journey", "Write the release checklist",
  "Polish the card editor", "Test keyboard navigation", "Build light and dark themes",
  "Set up local board storage", "Define the visual direction", "Ship drag-and-drop ordering",
];
export const roadmap: Board = {
  id: "roadmap", title: "Product roadmap",
  columns: ["To Do", "In Progress", "Done"].map((title, order) => ({ id: `col-${order}`, title, order, colorIndex: order })),
  tags: ["Design", "Experience", "Development"].map((name, colorIndex) => ({ id: `tag-${colorIndex}`, name, colorIndex })),
  cards: titles.map((title, index) => ({
    id: `KB-${21 + index}`, title, columnId: `col-${Math.floor(index / 3)}`, description: ["Make switching between projects feel effortless.", "A clear next step, even before the first task.", "The small details that make a launch feel ready."][index % 3],
    priority: (["high", "medium", "low"] as const)[index % 3], tagIds: [`tag-${index % 3}`], deadline: "2030-06-16",
    subtasks: [], createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T00:00:00Z", order: index % 3,
  })),
};
export const collection: BoardCollection = {
  version: 1, activeBoardId: roadmap.id,
  boards: [roadmap, { id: "website", title: "Website refresh", cards: [], tags: [], columns: roadmap.columns.map((column) => ({ ...column, id: `website-${column.id}` })) }],
};
