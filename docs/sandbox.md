# Sandbox v1

AppHub publishes the host access an application needs. It does not launch applications or enforce
the policy. Installers and runtimes read the policy from an API v1 application resource and apply it
before starting the AppImage.

The contract is backend-neutral. A Linux implementation can use
[Bubblewrap](https://github.com/containers/bubblewrap) for namespaces and mounts and
[xdg-dbus-proxy](https://github.com/flatpak/xdg-dbus-proxy) for filtered D-Bus access. Equivalent
implementations are valid when they provide the same behavior.

## Required behavior

Every application receives private writable storage. All other host access is denied unless the
policy allows it. A runtime must refuse to launch when it cannot enforce a requested value. It must
not silently grant broader access.

The baseline sandbox provides:

- A private home directory and temporary directory.
- New user and mount namespaces.
- New PID and IPC namespaces unless the policy requests host access.
- Isolated UTS and cgroup namespaces when the host supports them.
- A new `/proc` and a minimal `/dev`.
- Read-only operating-system files needed to start the application.
- No host network, display, audio, files, devices, or direct D-Bus access.

The runtime is also responsible for making the AppImage payload available without granting extra
host access. It can mount the AppImage before entering the sandbox or use the AppImage runtime's
extract-and-run support.

## Permissions

| Field        | Value                | Required behavior                                              |
| ------------ | -------------------- | -------------------------------------------------------------- |
| `network`    | `none`               | Use an isolated network namespace.                             |
|              | `full`               | Share the host network available to the launching user.        |
| `display`    | `none`               | Expose no display socket.                                      |
|              | `wayland`            | Expose only the active Wayland socket.                         |
|              | `x11`                | Expose only the active X11 socket and its authentication data. |
|              | `wayland-or-x11`     | Prefer Wayland and fall back to X11. Never expose both.        |
| `audio`      | `none`               | Expose no host audio service or audio device.                  |
|              | `full`               | Allow audio input and output through the host audio service.   |
| `processes`  | `isolated`           | Use an isolated PID namespace.                                 |
|              | `full`               | Expose host processes available to the launching user.         |
| `ipc`        | `false`              | Use an isolated IPC namespace.                                 |
|              | `true`               | Share the host IPC namespace.                                  |
| `filesystem` | location and access  | Bind the resolved host location read-only or read-write.       |
| `devices`    | device category list | Expose only devices belonging to the requested categories.     |
| `sessionBus` | bus access object    | Apply the session D-Bus behavior described below.              |
| `systemBus`  | bus access object    | Apply the system D-Bus behavior described below.               |

`full` never grants privileges the launching user does not already have.

### Files

Filesystem locations are `home`, `desktop`, `documents`, `downloads`, `music`, `pictures`,
`public-share`, `templates`, `videos`, and `removable-media`. A runtime resolves the host user's XDG
directories before entering the sandbox. `home` means the host home directory, not the private app
home.

Access is `read-only` or `read-write`. When `home` and a more specific location overlap, the more
specific rule applies to that location. With no filesystem rules, the app sees only its private
storage and the read-only runtime files.

### Devices

Device categories are `gpu`, `input`, `camera`, `usb`, `serial`, `optical`, `fuse`, and `kvm`.
Runtimes resolve the device nodes that belong to each category on the host and expose only those
nodes. Direct input, USB, FUSE, and KVM access are powerful permissions and must not be implied by
another field.

| Category  | Host devices                                                        |
| --------- | ------------------------------------------------------------------- |
| `gpu`     | Graphics devices required by the active driver, normally `/dev/dri` |
| `input`   | All user-accessible devices under `/dev/input`                      |
| `camera`  | All user-accessible video and media capture devices                 |
| `usb`     | All user-accessible devices under `/dev/bus/usb`                    |
| `serial`  | All user-accessible serial character devices                        |
| `optical` | All user-accessible optical block and matching generic SCSI devices |
| `fuse`    | `/dev/fuse` and the mount permission needed to use it               |
| `kvm`     | `/dev/kvm`                                                          |

### D-Bus

Both bus fields use the same object:

```json
{
  "access": "filtered",
  "rules": [{ "name": "org.example.Service", "access": "talk" }]
}
```

- `none` requires an empty `rules` array and exposes no direct access to that bus.
- `filtered` requires at least one rule. A runtime exposes a private proxy socket and applies every
  rule.
- `full` requires an empty `rules` array and exposes the complete bus available to the launching
  user.

Rule names are exact D-Bus well-known names. Wildcards are not part of sandbox v1. Rule access is:

- `see`: the app can discover the name and follow its owner.
- `talk`: `see`, plus sending messages to the name and receiving its broadcasts.
- `own`: `talk`, plus requesting ownership of the name.

These levels map directly to the corresponding `xdg-dbus-proxy` policies. A different proxy must
provide equivalent behavior.

## Portals

Standard desktop portals are baseline desktop integration and are not declared per app. A runtime
keeps the host portal service reachable through a filtered session-bus connection. This does not
grant access to unrelated session-bus names. User approval and the host portal implementation still
control each portal request.

## Versioning

Sandbox v1 is part of API v1 and is frozen. Existing fields, values, and meanings will not change. A
breaking sandbox change requires a new sandbox schema and a new API version. Internal catalog
changes must not alter `/api/v1/schema.json` or existing API v1 application resources.

An individual app's declared values can change when its actual requirements change. That is a data
update, not a change to the v1 contract.
