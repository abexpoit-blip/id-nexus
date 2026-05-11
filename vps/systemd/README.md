# Process management

NexusX uses **PM2** (configured by `01-bootstrap.sh`), not systemd directly.
PM2 itself runs under a systemd unit installed automatically:

```bash
systemctl status pm2-deploy
sudo -u deploy pm2 list
sudo -u deploy pm2 logs nexusx-api
sudo -u deploy pm2 restart nexusx-api
```

If you ever want a pure-systemd alternative, drop a unit like below into
`/etc/systemd/system/nexusx-api.service` and `systemctl enable --now nexusx-api`:

```ini
[Unit]
Description=NexusX API
After=network.target postgresql.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/var/www/api.nexus-x.cloud
EnvironmentFile=/var/www/api.nexus-x.cloud/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```