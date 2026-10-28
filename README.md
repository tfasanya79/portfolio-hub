# portfolio. hub

The landing page for my self-hosted security and network tools, served at https://timfas.com.

## Tools listed

| Tool | What it does |
|------|--------------|
| [cert-check](https://timfas.com/cert-check/) | TLS certificate assessment with expiry, chain of trust, protocol version, key strength and hostname coverage |
| [inspect](https://timfas.com/inspect/) | Domain email authentication and security header inspection with A to F grading |
| [acl-gen](https://timfas.com/acl-gen/) | Firewall rule translator across Cisco IOS, pfSense, iptables, AWS NACL and Azure NSG |
| [passcheck](https://timfas.com/passcheck/) | Client side password strength and breach checker using k-anonymity |
| [subnet](https://timfas.com/subnet-calculator/) | IPv4 and CIDR calculator with binary breakdown and VLSM splitter |
| [cv-builder](https://timfas.com/cv-builder/) | Local first CV builder and job assistant |

## Stack

Single file vanilla HTML, CSS and JavaScript. No framework and no build step. Tools are listed in a small array in `index.html`, so adding one is a one line change and a redeploy.

## Deployment

Server first workflow. Changes are made and deployed on the host.

```bash
ssh <vm-host>
cd ~/portfolio-hub
git pull
./deploy.sh
```

`deploy.sh` copies the site to `/var/www/portfolio-hub/`, which is the root Caddy serves for timfas.com.

---

Built by Tim, one small tool at a time.
