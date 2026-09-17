# Security policy

The project is pre-release. Only the latest 0.1.x line is intended to receive fixes.

The analyzer reads local source and configuration as text; it must never execute a project's configuration, import its application modules, or upload source. Generated HTML escapes user-controlled text and embeds no scripts or remote resources.

The project repository is https://github.com/taneruzum/next-cache-trace. Use its Security tab to check whether private vulnerability reporting is enabled: https://github.com/taneruzum/next-cache-trace/security/advisories. Availability has not yet been verified; the maintainer must enable private reporting before the first npm release. Do not post exploit details in public issues.

Reports contain local paths, literal tag names, function names and diagnostics. Review generated artifacts before sharing them publicly.
