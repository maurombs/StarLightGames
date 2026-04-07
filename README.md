Snake — simple web game

Files:
- index.html — main page
- style.css — styles
- app.js — game logic

Run:
- Open `index.html` in your browser, or run a simple static server:

```bash
# from the workspace root
cd snake-game
python3 -m http.server 8000
# then open http://localhost:8000
```

Controls:
- Arrow keys or WASD to move
- If the snake's head touches its body (or the walls), the game ends

You can tweak `COLS`/`ROWS` or `speed` in `app.js` to change difficulty.