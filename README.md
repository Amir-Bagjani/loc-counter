# loc-counter

[![npm version](https://img.shields.io/npm/v/@amir-bagjani/loc-counter.png)](https://www.npmjs.com/package/@amir-bagjani/loc-counter)
[![npm downloads](https://img.shields.io/npm/dm/@amir-bagjani/loc-counter.png)](https://www.npmjs.com/package/@amir-bagjani/loc-counter)

A simple CLI tool written in **TypeScript** that counts lines of code in your project.  
Designed for frontend projects, it ignores non-code files (Markdown, images, lockfiles, etc.) and provides per-extension breakdowns.

---

## ✨ Features

- Count total lines, non-empty lines, and comment-only lines
- Per-extension statistics
- Top N largest files by line count
- JSON or text output
- Optional file count mode
- Ignores common non-code files (`.md`, `.json`, images, etc.)

---

## 📦 **Installation**

```bash
# install globally
npm install -g @amir-bagjani/loc-counter

# or use with npx (no install required)
npx @amir-bagjani/loc-counter ./my-project
```

---

## 🚀 Usage

```bash
loc-counter <path> [options]
```

### Examples

```bash
# Count lines in current folder
loc-counter .

# Show top 5 largest files
loc-counter ./src --top 5

# Output results in JSON format
loc-counter ./app --format json

```

---

## ⚙️ Options

| Flag              | Description                                                                 | Default |
|-------------------|-----------------------------------------------------------------------------|---------|
| `--top <N>`       | Show the N largest files by line count                                      | 10      |
| `--format <type>` | Output format: `text` or `json`                                             | text    |
---

## 📊 Example Output

### Text format

```
LOC Counter report
Target: ./src
Files counted: 124
Total lines: 13842
Non-empty lines: 11239
Comment-only lines (heuristic): 2123

Per-extension breakdown:
  ts     files:   34  lines:    7200  non-empty:   5800  comments:   900
  js     files:   20  lines:    3000  non-empty:   2500  comments:   200

Top largest files:
   1024 lines  src/App.tsx
    900 lines  src/components/BigComponent.tsx
```

### JSON format

```json
{
  "target": "./src",
  "total": {
    "lines": 13842,
    "nonEmpty": 11239,
    "comments": 2123
  },
  "perExtension": {
    ".ts": { "files": 34, "lines": 7200, "nonEmpty": 5800, "comments": 900 },
    ".js": { "files": 20, "lines": 3000, "nonEmpty": 2500, "comments": 200 }
  },
  "topLargest": [
    { "file": "src/App.tsx", "stats": { "lines": 1024, "nonEmpty": 800, "comments": 120, "extension": ".ts" } }
  ]
}
```

---

## 🛠 Development

Clone and build locally:

```bash
git clone https://github.com/amir-bagjani/loc-counter.git
cd loc-counter
npm install
npm run build
```

Run with ts-node (development mode):

```bash
npx ts-node src/loc-counter.ts ./my-project
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!  
Feel free to check the [issues page](https://github.com/amir-bagjani/loc-counter/issues).

---

## 📄 License

MIT © [Amir Bagjani](https://github.com/amir-bagjani)