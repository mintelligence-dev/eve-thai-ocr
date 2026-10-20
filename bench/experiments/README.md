# Experiment: does preprocessing the photo help?

**Question.** Would straightening or cleaning up a photo before sending it to the model make it read more accurately? Candidates were a document scanner such as [jscanify](https://www.npmjs.com/package/jscanify) (OpenCV.js; crop to the paper and fix perspective) and contrast tools such as `sharp`.

**Method.** `preprocess.py` makes four versions of each test image and `pnpm bench` scores each version with the default model (`google/gemini-2.5-flash`), 3 runs per image:

| Variant | What it does |
|---|---|
| `base` | what the app does today: resize to 2048 px, JPEG |
| `scan` | find the white paper, crop it and correct the perspective (OpenCV; a simple stand-in for jscanify, not jscanify itself) |
| `enhance` | greyscale, CLAHE contrast, unsharp mask |
| `scan_enhance` | both |

Test images: three real receipts (private, not in the repo) and three synthetic ones: a clean Thai receipt photographed at an angle on a cluttered desk with a shadow, a very faded copy, and a blurred and tilted copy (`bench/cases/receipt-thai-blurred`).

**Result** (mean accuracy over 3 runs):

| Image | base | scan | enhance | scan_enhance |
|---|---|---|---|---|
| real receipt A | 100% | 100% | 97% | 93% |
| real receipt B | 96% | 96% | 93% | 89% |
| real receipt C (laptop in the background) | 83% | 100% | 79% | 96% |
| synthetic: angle + clutter + shadow | 52% | 71% | 48% | 67% |
| synthetic: very faded | 24% | 38% | 71% | 57% |
| synthetic: blurred + tilted | 0% | 0% | 0% | 0% |
| all runs | 59% | 66% | 65% | 67% |

**What it says**

- **On ordinary real photos the model already does well**, so preprocessing adds little. The one real gain (receipt C, 83% → 100%) is 3 runs and could be noise.
- **Straightening helps when the problem is geometry** (synthetic angle: +19 points). On real photos a simple paper detector sometimes cropped the receipt's edge (the tax-class letters of receipt A were cut off in one case), so a crop can lose data.
- **Contrast enhancement helps very faded paper a lot** (24% → 71%) and slightly hurts normal photos (−3 to −4 points, within noise). It would have to be conditional: only when the image really is low-contrast.
- **Blur is not fixed** by either.

**Caveats.** 3 runs per cell, so differences of a few points mean nothing. The faded and angled cases are synthetic and probably harsher than real life. We have no real faded thermal receipts yet.

**Decision.** Do not add OpenCV.js (several MB) to the app yet. Next step: collect real faded and strongly tilted receipts. If they show the same gain, add a *conditional* contrast stretch (a few lines on a canvas, no library) and, only if tilt turns out to matter in practice, an optional "straighten" step.
