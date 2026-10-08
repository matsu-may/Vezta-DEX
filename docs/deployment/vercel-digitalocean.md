# Deploy demo Base Sepolia: Vercel + DigitalOcean

Phạm vi: demo độc lập, một API process, ví người dùng ký. Bắt đầu **read-only**;
chỉ bật giao dịch sau khi HTTPS reads và recovery đạt. Không copy flags của
`dev:testnet` lên hosting. Không upload `.local-evidence`, `.env` hoặc contexts local.

## 1. Việc chủ dự án chuẩn bị

1. Đăng nhập Vercel và DigitalOcean, kết nối GitHub `matsu-may/Vezta-DEX`.
2. Tạo Droplet Ubuntu 24.04 với SSH key. Đề xuất demo: 2 vCPU / 2 GB RAM,
   region gần RPC; kiểm tra giá hiện tại trước khi tạo. Build có thể cần thêm RAM.
3. Có hostname API, ví dụ `api-dex.your-domain.com`; tạo DNS **A** tới IPv4 Droplet.
   Chỉ thêm AAAA khi IPv6 đã cấu hình đúng. Caddy cần truy cập công khai cổng 80/443.
4. Chuẩn bị Base Sepolia RPC (chain **84532**), có `eth_call`, receipt và lịch sử
   block cần kiểm chứng; giữ URL có credentials riêng tư. Bắt đầu `RPS=3`.
5. Giữ một ví demo có faucet USDC/WETH và test ETH. Hoàn tất các giao dịch local
   đang theo dõi trước khi chuyển origin; localStorage không tự chuyển sang domain mới.

Không cần gửi token, RPC URL hoặc SSH private key vào chat. Nếu dùng server có sẵn,
kiểm tra cổng 80/443 và gateway hiện tại; không chạy Compose này đè lên gateway khác.

## 2. Tạo frontend để lấy origin ổn định

Vercel → **Add New → Project → Import** repository. Dùng các settings:

| Setting | Giá trị |
|---|---|
| Production branch | `main` |
| Framework | Next.js |
| Root Directory | `apps/web` |
| Include source files outside Root Directory | Bật, cần `packages/core` |
| Node.js | `24.x` |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm exec next build --webpack` |
| Output Directory | Để mặc định |

Lần đầu chưa bật hosted mode/writes; deploy để lấy domain production ổn định,
ví dụ `https://vezta-dex-demo.vercel.app`. Lúc này dữ liệu API có thể unavailable.
Không dùng URL preview thay đổi theo commit làm origin được phép ký.

## 3. Chuẩn bị Droplet và package

SSH vào Droplet, cập nhật hệ điều hành và cài Docker Engine + Compose plugin theo
[Docker Ubuntu guide](https://docs.docker.com/engine/install/ubuntu/).
DigitalOcean Cloud Firewall: inbound SSH chỉ từ IP quản trị; HTTP/HTTPS công khai;
không mở **3021**. Cho phép outbound DNS/HTTPS để RPC, registry và ACME hoạt động.

```bash
git clone https://github.com/matsu-may/Vezta-DEX.git
cd Vezta-DEX
git checkout main
git rev-parse HEAD
sudo install -d -m 700 -o 1000 -g 1000 /srv/vezta-dex-data
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Ghi release SHA ở bước trên. Sửa `deploy/.env` bằng editor trên server:

```dotenv
DEX_API_HOST=api-dex.your-domain.com
DEX_PUBLIC_ORIGIN=https://your-project.vercel.app
DEX_BFF_TOKEN=<64 hexadecimal characters, generated privately>
DEX_HOSTED_WRITES_ENABLED=0
BASE_SEPOLIA_RPC_URL=<private Base Sepolia RPC URL>
BASE_SEPOLIA_RPC_RPS=3
DEX_DATA_DIR=/srv/vezta-dex-data
DEX_RELEASE_TAG=<short release SHA>
```

Tạo token riêng trong file bị Git ignore (không in ra log/chat):

```bash
umask 077
openssl rand -hex 32 > deploy/.env.token
```

Copy giá trị trong file này vào `DEX_BFF_TOKEN` bằng editor và vào Vercel secrets
ở bước 5. Không dùng token mẫu trong tests. Xóa file token riêng khi đã lưu an toàn.
Không chạy `docker compose config` không có `--quiet`: nó in expanded secrets.

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yaml build api
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
```

Compose giữ API UID 1000, image read-only, private bind volume, một instance.
Caddy cấp HTTPS; API không publish host port. Không scale API lên replicas.
Để API tiếp tục phục vụ recovery trong deploy, giữ nguyên volume và shared token.

## 4. Kiểm tra backend read-only

```bash
curl --fail --show-error https://api-dex.your-domain.com/healthz
curl -s -o /dev/null -w '%{http_code}\n' https://api-dex.your-domain.com/readyz
```

Đạt: health `{"status":"ok"}`; ready không auth **401**. Không gửi bearer token
trong command history. Kiểm tra ready đã auth từ container bằng env có sẵn:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T api node -e 'fetch("http://127.0.0.1:3021/readyz",{headers:{authorization:"Bearer "+process.env.DEX_BFF_TOKEN}}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.json()})))'
```

Đạt: **200**, `ready`. Đây chỉ xác nhận RPC đã cấu hình + stores khởi tạo; chưa
chứng minh RPC khỏe hoặc ví swap thành công. `503` cần kiểm tra RPC config và quyền
`/srv/vezta-dex-data`; log chỉ nên có safe code, không credentials/calldata.

## 5. Nối frontend và kiểm tra dữ liệu

Vercel → **Settings → Environment Variables**. Chỉ thêm cho **Production**:

| Tên | Giá trị |
|---|---|
| `DEX_HOSTED_MODE` | `1` |
| `DEX_PUBLIC_ORIGIN` | HTTPS origin production, khớp backend |
| `DEX_API_URL` | `https://api-dex.your-domain.com` |
| `DEX_BFF_TOKEN` | Cùng secret với backend |
| `DEX_HOSTED_WRITES_ENABLED` | `0` |

Không dùng prefix `NEXT_PUBLIC_` cho những biến này. Vercel quản lý
`NODE_ENV=production`; không copy `.env.local`. Redeploy để nhận biến mới.
Preview giữ hosted mode/writes tắt và không chứa credentials production.

Mở `/demo/3` (Explore/detail), `/demo/2` (Positions) và `/demo/1` (Swap).
Đạt: nhãn **Base Sepolia**, quote/minimum và positions đọc được; ví mới có thể
hiện **No positions owned**; submit bị tắt. API ngoài allowlist Base Sepolia trả
404, browser Origin/Host sai bị từ chối, token không xuất hiện trong Network response.
Nếu 429, chờ và tránh nhiều tab gọi đồng thời; API nhận tối đa 2 request hoạt động.

### Chẩn đoán hosted quote bị từ chối

Response quote có `diagnostic` là nhãn cố định, không chứa secret/header values.
`hosted-configuration-invalid` cần kiểm tra biến Production và redeploy;
`host-mismatch`/`origin-mismatch` cần đối chiếu domain đang mở với
`DEX_PUBLIC_ORIGIN`. Các nhãn `forwarded-*` hoặc `https-required` cần kiểm tra
request qua reverse proxy, không tắt kiểm tra origin để bỏ qua lỗi.

Trong hosted mode trên Vercel (`VERCEL=1` từ server environment), BFF bỏ qua
metadata `Forwarded`; không dùng header này để xác thực hoặc chọn backend.
`Origin`, `Host`, HTTPS và `X-Forwarded-Host`/`X-Forwarded-Proto` vẫn phải khớp
origin đã cấu hình. Request upstream chỉ dùng URL/token từ cấu hình server,
không chuyển tiếp các header proxy do browser gửi. Local mode và hosted mode
ngoài Vercel tiếp tục từ chối `Forwarded`.

Giữ **Automatically expose System Environment Variables** bật trong Vercel.
`VERCEL` có ở build và runtime; không tự đặt bằng header hoặc biến public.
Tham khảo [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).

Vercel CLI `env pull` có thể thay Secret bằng placeholder. Không suy ra độ dài
hoặc tính hợp lệ của token thật từ placeholder đó. `GET /api/testnet-depth` trả
200 xác nhận request đọc đã đi qua BFF, backend auth và RPC; nó không xác nhận
kiểm tra origin của các POST hoặc quyền gửi giao dịch.

## 6. Bật và nghiệm thu testnet writes

Chỉ khi bước 4–5 đạt:

1. Backend: đặt `DEX_HOSTED_WRITES_ENABLED=1` trong `deploy/.env`, chạy lại `up -d`.
2. Vercel: đặt cùng flag `1` cho Production, redeploy. Hai phía đều phải bật.
3. Ví dùng **84532** và faucet tokens; swap nhỏ USDC → WETH, rồi WETH → USDC.
4. Kiểm tra receipt **confirmed**, verified output ≥ minimum được review và acknowledge.
5. LP: mint → increase → decrease một phần/hết → collect → burn; kiểm tra NFT,
   amounts và original hash. Collect gồm vốn + phí, không coi toàn bộ là lợi nhuận.
6. Reject một prompt, reload sau có hash, kiểm tra app giữ hash và không tự resend.
7. Trong một giao dịch đã có hash, restart **API container** rồi check original
   receipt; giữ volume nguyên. Chỉ restart khi bạn đang làm bài kiểm tra recovery.

Xem [checklist chi tiết](../research/2026-10-02-testnet-desktop-owner-guide.md).
`unverified`/`reorged`/uncertain: giữ hash/context, gửi safe diagnostic; không gửi lại
để thử. Ghi URL, release SHA và hashes nghiệm thu, sau đó quay video desktop.

## 7. Kill switch, cập nhật và rollback

- Khi sự cố: flag writes **0** cả backend + Vercel, apply/redeploy. Quote/study
  còn đọc; final recheck bị chặn; original receipt tracking vẫn hoạt động.
- Không chạy `down -v`, không xóa data/contexts để xử lý lỗi. Tracking contexts hết
  hạn sau 24 giờ theo policy hiện có; tiếp tục kiểm tra sớm sau khi gửi.
- Cập nhật: pin release SHA mới, build trước, rồi `up -d`; giữ cùng mount/token.
  Vercel web/API phải dùng contract cấu hình tương thích. Không commit credentials.
- Rollback: checkout release SHA đã ghi, đặt release tag tương ứng, build/up lại;
  rollback Vercel về deployment tương thích. Giữ volume; quote chưa gửi cần lấy mới.
- Backup: khi không còn giao dịch pending, dừng riêng API, backup thư mục
  `/srv/vezta-dex-data` bằng tài khoản quản trị, giữ mode/owner, khởi động API lại.
  Lưu backup riêng có mã hóa, không upload vào Git. Thử restore vào volume riêng
  trước khi dựa vào backup. Không chạy hai API cùng thư mục.

## Nguồn hướng dẫn chính thức

- [Vercel workspace sources](https://vercel.com/docs/monorepos/monorepo-faq)
- [DigitalOcean: tạo Droplet](https://docs.digitalocean.com/products/droplets/how-to/create/)
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)

Code/config đã được chuẩn bị; actual domain, tài khoản, DNS, RPC qualification
và wallet acceptance trên hosting vẫn cần chủ dự án thực hiện.
