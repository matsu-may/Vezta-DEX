# Lộ trình đưa Vezta DEX demo lên Vercel

**Ngày:** 2026-10-04. **Trạng thái:** code/config hosting đã chuẩn bị; chưa triển khai server/domain thật.
Phạm vi: demo desktop Base Sepolia, độc lập với Vezta chính. Checklist chưa đánh
dấu dưới đây là việc sắp làm, không phải bằng chứng hoàn thành.

## Điểm xuất phát

- [x] Code và báo cáo song ngữ đã xuất bản lên `matsu-may/Vezta-DEX`.
- [x] Nhánh local và default branch GitHub là `main`. `main` cũ tại `d3fe23b`
  được giữ local dưới tên `archive/main-before-2026-10-04`.
- [x] GitHub CI tại `f4a27cc` pass frozen install, test, typecheck, lint, build:
  [run 37201103370](https://github.com/matsu-may/Vezta-DEX/actions/runs/37201103370).
- [x] Chủ dự án báo pass swap hai chiều, LP lifecycle và recovery ở local.
- [ ] Nghiệm thu giao diện compact và hành vi trên domain HTTPS sau triển khai.

Repo GitHub hiện được kiểm tra là **public**. Không đưa credentials hoặc recovery
contexts vào Git bất kể visibility. Xem [publication record](../../research/2026-10-04-github-publication.md).

## Kiến trúc đề xuất

```text
Browser + MetaMask
      │ HTTPS cùng origin
      ▼
Vercel: apps/web + packages/core
      │ HTTPS + xác thực giữa server
      ▼
Node API: apps/api, một process
      ├── Base Sepolia RPC: quote / simulation / receipt
      └── private persistent volume: swap và LP recovery contexts
```

Ví người dùng ký/gửi; API không giữ private key. Một API process giữ đúng mô hình
quote consumption và RPC limiter hiện có. Chưa thêm replicas hoặc chuyển toàn bộ
API sang serverless: việc đó cần shared atomic storage và shared limiter.

Code đã có hosted policy riêng, backend authentication và configurable persistent
storage; local vẫn dùng loopback. Đổi riêng `DEX_API_URL` hoặc copy cờ
`dev:testnet` lên Vercel **chưa đủ**: phải cấu hình đầy đủ hosted contract.
[Phân tích blocker](../../research/2026-10-04-vercel-readiness.md).

### Checkpoint chuẩn bị (không phải nghiệm thu hosted)

| Giai đoạn | Đã chuẩn bị | Còn lại trên hosting |
|---|---|---|
| 1 | Spec, env contract, origin/auth, limits và recovery policy | Điền origins/secrets thật |
| 2 | API allowlist/auth và HTTPS BFF, tests positive/negative | Qualify HTTPS reads với RPC thật |
| 3 | Docker/Compose/Caddy, private volume và restart fixtures | Droplet, TLS, backup/restore/restart trên server |
| 4 | Default-off writes, exact origin và kill switch giữ receipts | MetaMask acceptance trên domain HTTPS |
| 5 | Settings và runbook từng bước | Tạo resources/DNS, deploy read-only, staging checks |
| 6 | Checklist có sẵn | Bật writes sau qualification, nghiệm thu/quay video |

Các checklist bên dưới giữ tiêu chí end-to-end; không đánh dấu hoàn thành chỉ
dựa vào unit tests. Xem [runbook](../../deployment/vercel-digitalocean.md) và
[báo cáo chuẩn bị](../../research/2026-10-04-hosted-testnet-preparation.md).

## Giai đoạn 1 — Đặc tả môi trường hosted

**Phụ thuộc:** không. Tạo spec trong `docs/superpowers/specs/`.

- [ ] Chốt frontend/API origins HTTPS, proxy trust và xác thực BFF → API;
  browser chỉ gọi BFF cùng origin.
- [ ] Định nghĩa local / preview / hosted testnet, default-off submission;
  preview URL tự sinh không tự được cấp quyền giao dịch.
- [ ] Chốt request limits, timeouts, context retention, readiness, backup và rollback.

**Đạt khi:** cấu hình sai bị từ chối; có environment matrix và trust boundaries.
**Kiểm tra:** đối chiếu `main.ts`, wallet proxies, demo gate và context stores;
review spec trước khi sửa behavior.

## Giai đoạn 2 — Explore và Positions đọc qua HTTPS

**Phụ thuộc:** 1. Hai slice: API auth/config, rồi read BFF.
Files chính: `apps/api/src/main.ts`, `apps/web/lib/testnet-depth.ts`,
`apps/web/lib/testnet-lp.ts` và tests tương ứng.

- [ ] API chạy sau HTTPS gateway với auth và một process; BFF dùng upstream
  cố định, response schema validation, giới hạn response/timeout.
- [ ] Chặn URL chứa credentials, redirects, caller-selected host và request
  thiếu/sai auth; giới hạn request công khai tại backend.
- [ ] Explore/detail/positions đọc dữ liệu thật trên production web; writes
  vẫn tắt; outage trả safe error code, không lộ RPC URL/key vào browser.

**Đạt khi:** web → API → RPC đọc đúng qua HTTPS.
**Kiểm tra:** focused auth/proxy tests và một HTTPS smoke có giới hạn.

## Giai đoạn 3 — Đóng gói API và giữ recovery qua deploy

**Phụ thuộc:** 1; hoàn tất trước writes. Tách packaging và storage/restart.
Files chính: `apps/api/package.json`, `main.ts`, hai context stores, deployment config mới.

- [ ] Release chạy từ clean checkout, Node 24, frozen lockfile. Start hiện dùng
  `tsx` ở devDependencies: chọn build JavaScript hoặc đóng gói dependency cần
  chạy; không mặc định `pnpm install --prod` sẽ đủ.
- [ ] Dùng runtime pins đã commit; API requests không compile source hoặc đọc
  bằng chứng riêng trên máy dev. Chỉ đóng gói artifacts thực sự cần runtime.
- [ ] Thay đường dẫn context cố định dưới `.local-evidence` bằng private volume
  configurable; giữ permissions/atomic writes. Thêm health/readiness không lộ secrets.

**Đạt khi:** restart/redeploy giữ original context/hash; quote chưa gửi hết hiệu
lực an toàn; storage unavailable chặn action cần recovery; restart không broadcast.
**Kiểm tra:** clean release boot, volume smoke và restart/recovery với fixtures.

## Giai đoạn 4 — Luồng ví trên domain testnet được duyệt

**Phụ thuộc:** 2 và 3. Làm swap trước, LP sau.
Files chính: `testnet-demo-gate.ts`, `testnet-wallet-proxy.ts`,
`testnet-lp-wallet-proxy.ts`, shared hosted policy mới và tests.

- [ ] Hosted policy riêng: exact origin, trusted forwarded headers, default-off
  writes; chặn wrong origin/chain, forged headers và unauthorized API calls.
- [ ] Giữ runtime verification, exact approvals, deadline, simulation, fee budget,
  once-only final recheck và explicit wallet confirmation cho cả swap/LP.
- [ ] Kill switch chặn action mới nhưng giữ original receipt tracking và contexts;
  giữ cross-flow recovery lock, không xóa pending records.

**Đạt khi:** production build chạy HTTPS cho origin được cấu hình; không tự
prompt/ký/broadcast, local mode vẫn pass tests.
**Kiểm tra:** controller/proxy tests và mock browser trên production build.

## Giai đoạn 5 — Staging và cấu hình Vercel

**Phụ thuộc:** 2–4 và provider/account được chủ dự án chọn.

- [ ] API staging có HTTPS, persistent disk, một instance; ghi release SHA,
  volume mount, backup/restore và rollback procedure.
- [ ] Import GitHub vào Vercel theo bảng bên dưới; deploy read-only trước.
  Staging wallet test dùng origin ổn định được duyệt, không wildcard preview.
- [ ] Qualify HTTPS reads, auth/origin negative cases và recovery sau API restart;
  theo dõi safe errors, latency, RPC 429 và storage capacity.

**Đạt khi:** clean deployment boot, recovery qua restart/rollback, frontend/API
release tương thích; không có secrets trong client bundle/logs. Chốt timeout
phù hợp depth latency thực tế và giới hạn Vercel được sử dụng.
**Kiểm tra:** CI đầy đủ một lần cho nhóm thay đổi behavior, staging smoke có giới hạn.

## Giai đoạn 6 — Publish và nghiệm thu hosted demo

**Phụ thuộc:** staging đạt và chủ dự án duyệt hosting/domain/quyền triển khai.

- [ ] Publish bản đã kiểm tra ở domain demo ổn định; bật testnet writes có kiểm soát.
- [ ] Chủ ví dùng faucet tokens kiểm tra Explore/detail, swap nhỏ hai chiều,
  LP lifecycle, Reject và reload/original-hash recovery; sau đó quay video.
- [ ] Ghi URL/release SHA/nghiệm thu và rollback; cập nhật README/Notion.

**Đạt khi:** receipt và amounts/NFT được xác minh trên hosted origin; nhãn Base
Sepolia và fee estimates rõ ràng. Local acceptance không thay hosted acceptance.
**Kiểm tra:** cập nhật domain trong [owner guide](../../research/2026-10-02-testnet-desktop-owner-guide.md).
Nếu `unverified`, giữ context/hash và báo safe diagnostics, không resend để thử.

## Settings Vercel dự kiến

| Mục | Giá trị |
|---|---|
| Git repository / Production branch | `matsu-may/Vezta-DEX` / `main` |
| Framework / Root Directory | Next.js / `apps/web` |
| Node / package manager | 24.x / pnpm 10.33.2 |
| Workspace sources | Include files outside root để dùng `packages/core` |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command, từ `apps/web` | `pnpm exec next build --webpack` theo build production đã kiểm tra; xác minh lại trên Vercel |
| Output | Default của Next.js, không static export |
| Preview | API staging riêng; submission mặc định tắt |
| Production | Origin ổn định, API release đã qualify, hosted testnet policy |

Vercel hỗ trợ app root trong monorepo và Node 24.x:
[monorepos](https://vercel.com/docs/monorepos),
[build settings](https://vercel.com/docs/builds/configure-a-build),
[Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
Git integration có thể deploy khi push; quản lý preview/production theo
[Git deployment docs](https://vercel.com/docs/git). Không dùng `pnpm dev`
hay listener `127.0.0.1:3020` làm start command Vercel.

| Biến/cấu hình | Nơi đặt | Hiện trạng |
|---|---|---|
| `DEX_API_URL` | Vercel server env | Đã có; HTTPS cần sửa proxy trước |
| `BASE_SEPOLIA_RPC_URL`, `BASE_SEPOLIA_RPC_RPS` | API host | Đã có; quota RPC riêng quota Uniswap |
| `PORT`, `HOST` | API host | Đã có; hosted binding/trust cần qualify |
| BFF/API auth, approved origins, hosted write flag | Server env tương ứng | Đề xuất mới; tên/schema chốt ở giai đoạn 1 |
| Private context directory | Persistent API volume | Đề xuất mới; chưa có configurable env path |

Base Sepolia direct-v3 không cần Uniswap Trading API key. Nếu giữ Polygon
diagnostics, credentials của phần đó vẫn chỉ ở API host. Không copy `.env`
hoặc private recovery files vào Vercel, Git hay public assets.

## Quyết định cần chủ dự án

1. **API hosting:** ưu tiên VM/Node service có persistent volume, single instance;
   có thể dùng máy chủ sẵn có nếu đủ isolation. Serverless toàn bộ API cần chuyển
   shared state nên để sau.
2. **Domain:** domain `*.vercel.app` ổn định đủ cho demo trước; custom domain tùy chọn.
3. **Truy cập và chi phí:** demo giới hạn người kiểm tra hay công khai; quota,
   chống abuse và ngân sách hosting/RPC phải theo lựa chọn này.

Có thể chuẩn bị code/tests/packaging/runbook độc lập. Chọn provider, cấp quyền
account, chấp nhận chi phí và xác nhận prompt ví thuộc chủ dự án.

## Rollback và cách tránh kiểm tra lặp

Khi auth/origin bị bypass, context mất dữ liệu hoặc receipt reconciliation sai:
tắt action mới, giữ receipt tracking/storage, pin lại frontend/API release tương
thích đã kiểm tra. Test backup restore trước hosted writes; không reset history.

Dùng focused tests cho từng slice, full CI một lần ở checkpoint nhóm. Không lặp
source/compiler rebuild hoặc toàn bộ fork chỉ vì đổi domain; chỉ mở rộng test
khi adapter/policy thay đổi hoặc còn rủi ro cụ thể.

Sau hosted demo, rà lại lộ trình testnet đầy đủ. Mobile polish, mainnet,
multi-chain và tích hợp Vezta chính tiếp tục là milestone riêng.
