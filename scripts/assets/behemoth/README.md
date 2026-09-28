# Behemoth directional source art

These eight 1024px source images are checked in so sprite generation works from
the repository without depending on files elsewhere on a developer's machine.
Each direction has its own authored image; the processing script does not mirror
views.

Run `node scripts/process-behemoth-sprites.mjs` to regenerate the eight
transparent 512px game sprites. The script places each view on the same ground
contact line at y=475.
