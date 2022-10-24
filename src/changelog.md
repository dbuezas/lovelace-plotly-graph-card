v1.4.0

- Feature: long term statistics support (thanks to @FrnchFrgg)
- Breaking change: yaml for attributes changed (use `attribute: temperature` instead of `climate.living::temperature`) see readme! (old way still works)
- Fix: `minimal_response` attribute was ignored and it was set equal to `significant_changes_only`instead
- Fix: default yaxes now applies to 30 yaxes (previously only 10)
