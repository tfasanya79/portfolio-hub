# portfolio. - Web tools hub

A small landing page linking to each single purpose web tool in this portfolio. New tools are added as they ship.

**Live app:** https://aipal-staging.cloud/portfolio/

## What is here

- [subnet.](https://github.com/tfasanya79/subnet-calculator): an IPv4 subnet and CIDR calculator
- [passcheck.](https://github.com/tfasanya79/passcheck): a password strength and breach checker

## Tech stack

Single file vanilla HTML, CSS, and JS (no framework, no build step). Projects are listed in a small JavaScript array in `index.html`, so adding a new tool is a one line change and a redeploy.

## Development and deployment

This project follows a server first workflow. All changes are made and deployed directly on the host VM, with no local development environment involved.

```bash
ssh <vm-host>
cd ~/portfolio-hub
git pull
./deploy.sh
```

`deploy.sh` copies the app to `/var/www/portfolio-hub/` (served via Caddy) and fixes ownership. Reload Caddy only if `/etc/caddy/Caddyfile` itself changes.

---

Built by Tim, one small tool at a time.
