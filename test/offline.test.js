import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const indexPath = fileURLToPath(new URL("../index.html", import.meta.url));
const stylePath = fileURLToPath(new URL("../offline-assets/style.css", import.meta.url));
const gamePath = fileURLToPath(new URL("../offline-assets/game.js", import.meta.url));

test("the game entry point uses only bundled offline assets", async () => {
  const [html, style, gameStats] = await Promise.all([
    readFile(indexPath, "utf8"),
    readFile(stylePath, "utf8"),
    stat(gamePath),
  ]);

  assert.match(html, /href="\.\/offline-assets\/style\.css"/);
  assert.match(html, /src="\.\/offline-assets\/game\.js" defer/);
  assert.doesNotMatch(html, /type="module"/);
  assert.doesNotMatch(`${html}\n${style}`, /https?:\/\//);
  assert.ok(gameStats.isFile() && gameStats.size > 0, `missing offline bundle under ${projectRoot}`);
});
