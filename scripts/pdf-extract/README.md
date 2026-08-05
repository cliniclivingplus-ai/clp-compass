# PDF recipe/lifestyle extractor

A standalone tool — run it yourself in a terminal. It never goes through Claude, so it can process as many PDFs as you have without using any chat time, and you can stop/resume it whenever.

It does NOT touch your live database or the app. It only reads your PDFs and writes files to a local `output/` folder for you to review.

## One-time setup

1. Open a terminal (Git Bash, same as you've used before) in this folder:
   ```bash
   cd "D:\Nutritionalist\clp_compass\clp-compass\scripts\pdf-extract"
   npm install
   ```
2. Make sure your Groq API key is available. Either:
   - it's already in the main app's `.env.local` file (it is, if you've used this app before — nothing to do), or
   - create a file named `.env` in this folder with one line: `GROQ_API_KEY=your-key-here`
3. (Recommended for a batch this size) Add a Gemini key too, in the same `.env` file: `GEMINI_API_KEY=your-key-here`. Groq's free tier has a daily token cap that a 66+ file run can hit partway through — if a Gemini key is present, the script automatically switches to it for the rest of the run the moment Groq starts failing, no restart needed. If you don't add one, the script just tells you it hit the Groq limit and you re-run later once it resets.

## Running it

```bash
node extract.js "D:\Nutritionalist\CanvaProtocols\PDF"
```

You can point it at more than one folder in the same run:

```bash
node extract.js "D:\Nutritionalist\CanvaProtocols\PDF" "D:\Nutritionalist\SomeOtherFolder"
```

To use Gemini as the primary provider instead of Groq (e.g. Groq's daily limit is still resetting):

```bash
node extract.js "D:\Nutritionalist\CanvaProtocols\PDF" --provider gemini
```

It will print progress as it goes — one line per PDF, one line per recipe found. A single PDF takes anywhere from a few seconds to a couple of minutes depending on its page count.

**If it stops partway (closed terminal, laptop slept, etc.), just run the exact same command again.** It skips every PDF it's already finished, so nothing is wasted or redone.

## What you get, in `output/`

- **`recipes-ready-for-review.json`** — every recipe found, across every PDF, already deduplicated (the same recipe appearing in multiple files only shows up once, keeping the most complete version and noting every file it came from).
- **`images/<pdf-name>/`** — the real photo for each recipe, pulled directly from the PDF (not a screenshot or a crop — the actual embedded image).
- **`lifestyle/<pdf-name>.txt`** — everything that wasn't a recipe (routines, guidelines, protocols, do's-and-don'ts). Once you're happy with a batch, these `.txt` files can be uploaded as-is through the app's existing Knowledge Base page (`/knowledge-base` → Upload .txt) — that's what feeds the AI's roadmap generation with your real protocols.

## What it doesn't do (on purpose)

- It doesn't write anything to Supabase or the live recipe bank. Nothing is "published" to patients from this tool.
- It doesn't guess or invent recipe content — if a field (servings, prep time, tags, benefits) isn't actually written on the page, it's left out rather than made up.
- `meal_type` (breakfast/lunch/dinner/snack/dessert) is a best-guess based on context and should get a quick human glance before import — it's occasionally wrong when a page gives no real hint (e.g. a dessert-shaped recipe sitting in a "Snacks" section with nothing on that page saying "dessert").

## After a run

Once `output/recipes-ready-for-review.json` looks right to you, bring it back to a Claude conversation (or ask me directly) to write the actual import-to-database step — that's a separate, deliberate step so nothing goes live without you seeing it first.
