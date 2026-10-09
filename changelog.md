Unreleased

- Calendar `integrate` resets now use stable periods in the configured timezone:
  `2d` is anchored to January 1, 1970 instead of today's midnight, `1w` follows
  Home Assistant's first weekday, and `1M` starts on the first of the month
  instead of using fixed 30-day periods. Fixed durations such as `24h` are unchanged.

v1.4.0

- Feature: long term statistics support (thanks to @FrnchFrgg)
- Breaking change: yaml for attributes changed (use `attribute: temperature` instead of `climate.living::temperature`) see readme! (old way still works)
- Fix: `minimal_response` attribute was ignored and it was set equal to `significant_changes_only`instead
- Fix: default yaxes now applies to 30 yaxes (previously only 10)
