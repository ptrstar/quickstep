# Ideas for later

## Ink drawing / hatching
- **Hatching along the form**: hatch lines following the local structure direction (structure tensor /
  gradient direction field, streamlines) instead of fixed angles. Next step up from Winkenbach &
  Salesin; see also Salisbury et al., "Orientable textures for image-based pen-and-ink illustration" (1997).
- **Tone compensation near outlines**: an outline already darkens its surroundings, so lighten the
  hatching (raise the thresholds) within a few px of outlines.

## Fonts (handwriting studio: v1 done — capture, clean, compose accents, SVG font export/import)
- Several versions per letter, picked at random while laying out text, so repeated letters differ (natural look).
- Kerning pairs (e.g. "To", "Wa") from the drawn shapes, or adjustable per pair.
- Joined script: entry/exit points per glyph so letters connect into one stroke.
- Small random baseline/size/slant jitter as a text option.
- Capture from a scan: write a sheet by hand, photograph it, cut cells and trace the centre lines.
