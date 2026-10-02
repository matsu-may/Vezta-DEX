# Bước 3 — Nghiệm thu demo DEX bằng MetaMask

Ngày cập nhật: 2026-10-02. Phạm vi: desktop, `/testnet`, Base Sepolia, Uniswap v3 USDC/WETH fee 0.3%. Dùng tài sản testnet; đây là bước nghiệm thu giao dịch trên mạng công khai, sau các kiểm tra local/fork/mock. Lộ trình LP và sản phẩm đầy đủ tiếp tục sau mốc demo sớm.

## 1. Chuẩn bị mạng trong MetaMask

Dùng extension MetaMask trên trình duyệt desktop, mở khóa ví bạn muốn kiểm tra. Chọn **Base Sepolia**, không chọn Base mainnet, Ethereum Sepolia hay Polygon. Nếu chưa có mạng: menu mạng → Add a custom network, điền:

| Trường | Giá trị |
|---|---|
| Network name | Base Sepolia |
| RPC URL | `https://sepolia.base.org` |
| Chain ID | `84532` |
| Currency symbol | ETH |
| Block explorer | `https://sepolia.basescan.org` |

Thông tin mạng theo [Base](https://docs.base.org/get-started/connect-to-base); thao tác thêm mạng theo [MetaMask](https://support.metamask.io/configure/networks/how-to-add-a-custom-network-rpc). RPC công khai ở trên dùng để cấu hình ví; app vẫn dùng `BASE_SEPOLIA_RPC_URL` server-only của bạn.

**Nếu Connect báo sai mạng:** Sepolia thông thường là Ethereum Sepolia, khác Base Sepolia. Thêm mạng theo bảng trên, chọn Base Sepolia rồi nhấn Connect lại. Việc kết nối chưa cần ETH/USDC; balance được kiểm tra ở bước quote/review.

## 2. Nhận test ETH và test USDC

1. Copy địa chỉ account đang chọn trong MetaMask.
2. Mở [Chainlink Base Sepolia faucet](https://faucets.chain.link/base-sepolia), chọn faucet **ETH trên Base Sepolia**, làm theo yêu cầu kết nối/xác minh của trang rồi nhận token. ETH dùng trả gas; không chọn LINK. Nếu faucet không cấp được, dùng một nguồn khác trong [hướng dẫn nhận test funds của Base](https://docs.base.org/get-started/get-funds). Điều kiện/cooldown của faucet có thể thay đổi.
3. Mở [Circle faucet](https://faucet.circle.com/): asset **USDC**, network **Base Sepolia**, paste cùng địa chỉ ví → gửi. Trang hiện cung cấp 20 test USDC mỗi lượt theo cooldown của faucet. Không cần mua USDC thật.
4. Chờ faucet transaction thành công trên Base Sepolia. Trong MetaMask cần thấy ETH >0 và ít nhất **1 USDC**. Bạn có thể nhận khoảng 0.01 test ETH hoặc hơn để có dư gas; app sẽ kiểm tra ngân sách phí thực tế trước từng action.
5. Nếu USDC chưa hiện, chọn Import tokens → Custom token:
   - Address: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
   - Symbol: USDC; decimals: 6.
   Địa chỉ theo [Circle USDC testnet contracts](https://developers.circle.com/stablecoins/usdc-contract-addresses).
6. WETH nhận sau swap có address `0x4200000000000000000000000000000000000006`, decimals 18, theo registry app đã kiểm tra on-chain. Import token này nếu ví chưa hiển thị. ETH trả gas và WETH input là hai balance khác nhau.

## 3. Khởi động đúng chế độ

Chưa có giao dịch đang pending/recovery thì dừng terminal `pnpm dev`/`dev:rehearsal` cũ bằng **Ctrl+C**. Nếu API từng chạy ở terminal khác, dừng terminal đó nữa. Không restart API trong lúc đang theo dõi giao dịch.

```bash
cd /Users/thongtran/Vezta/vezta-dex
pnpm dev:testnet
```

Giữ terminal này mở. Launcher chạy API `127.0.0.1:3021` và web `127.0.0.1:3020` cùng chế độ opt-in. Nếu báo port occupied, tìm terminal cũ và dừng nó; không chạy thêm API song song. Không cần reinstall hoặc chạy lại source rebuild/fork/probes đã đạt.

Mở **http://127.0.0.1:3020/testnet** bằng trình duyệt có MetaMask. Dùng đúng `127.0.0.1`, không đổi thành `localhost`. Panel phải ghi **Local testnet acceptance enabled**. `pnpm dev` bình thường là read-only preview; `pnpm dev:rehearsal` là luồng Polygon cũ, không phải chế độ này.

`apps/api/.env` cần `BASE_SEPOLIA_RPC_URL` đã cấu hình; `apps/web/.env.local` dùng `DEX_API_URL=http://127.0.0.1:3021`. Không đưa RPC có key vào trình duyệt hoặc gửi nội dung `.env`. CLI read-only vẫn có thể báo `executionEnabled:false`; quyền gửi chỉ thuộc consumer HTTP/desktop opt-in này. Backend không giữ khóa và không ký/gửi thay bạn.

## 4. Forward swap: 1 USDC → WETH

### Kết nối và quote

1. Chọn Base Sepolia trong MetaMask; hoặc nhấn **Switch to Base Sepolia** rồi đồng ý chuyển mạng. Nếu báo chưa có mạng, thêm theo mục 1.
2. Nhấn **Connect Base Sepolia wallet**, chấp nhận kết nối. Địa chỉ `Connected:` phải trùng account đã nhận faucet.
3. Direction **USDC → WETH**; Input amount **1 USDC**. Nhấn **Get wallet quote**.
4. Đối chiếu chain 84532, pool fee 0.3%, Input 1 USDC, Estimated received và Minimum received. Minimum là output raw ×9950/10000, làm tròn xuống; không phải báo giá USD thị trường. Quote có thời hạn **30 giây kể từ block quan sát**, nên thời gian còn lại khi nhận response có thể ngắn hơn.

### Approval nếu cần

5. Nhấn **Review approval**. Nếu thiếu token/gas, panel giải thích lý do; quay lại faucet, chờ nhận rồi lấy quote mới.
6. Nếu hiện **Exact token approval**, kiểm tra Action amount **1 USDC**, spender:
   `0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4`.
   Transaction target là USDC contract. Đây là direct v3 router trên testnet, không phải Permit2 của Polygon.
7. Đọc gas limit, gas price và **Complete snapshot fee budget** (đã bao gồm buffer L1/operator). Nhấn **Submit reviewed testnet transaction** → trong MetaMask kiểm tra Base Sepolia, token, spender/approval amount và phí rồi confirm. Không chuyển thành unlimited approval hoặc sửa nonce/gas fields của payload đã review.
8. Copy hash gốc/link explorer; chờ mined, nhấn **Check original transaction**. Nếu còn pending/confirming, chờ một vài giây rồi kiểm tra lại. Khi **confirmed** và ≥2 confirmations, đọc original approval event amount và **current allowance**. Nhấn **Acknowledge verified result**.
9. Nếu ban đầu hiện **Reset allowance to zero**, review số 0, gửi/check/ack reset trước; sau đó lấy quote mới và review exact approval. Nếu hiện **Allowance is ready**, không cần gửi approval. Không tạo unlimited allowance chỉ để ép thử reset; nhánh reset đã được kiểm tra bằng fork/mock.

### Gửi swap

10. **Get wallet quote** mới sau approval/reset. Nhấn **Review swap**. Nếu hiện approval-required, quay lại nhánh approval; không cố gửi swap.
11. Review lại amount/minimum, Action amount 1 USDC, target/router ở trên, nonce, gas và ngân sách phí. Chỉ có nút gửi khả dụng sau simulation và recheck đạt.
12. Nhấn **Submit reviewed testnet transaction**, kiểm tra popup MetaMask rồi confirm khi quote còn hạn. Nếu đã hết hạn hoặc bạn cần đọc lâu hơn: reject popup nếu chưa gửi, lấy quote mới và review lại; không tăng slippage/deadline để vượt lỗi. Việc reject không tự gửi bước khác.
13. Chờ và nhấn **Check original transaction** đến khi confirmed. **Verified executed output** phải ≥minimum của chính quote đã gửi. Mở explorer kiểm tra success, USDC chuyển vào và WETH nhận về.
14. Ghi hash, actual output, current allowance, L2 gas cost và charged transaction fee trên explorer. UI hiển thị **Verified L2 gas cost**; actual L1/operator charged fees chưa được qualifier thu thập đầy đủ, nên không gọi đó là tổng phí đã xác minh. Fee budget trước gửi là ước tính có buffer, không phải cam kết phí cuối.
15. Nhấn **Acknowledge verified result** trước khi bắt đầu giao dịch khác.

## 5. Reverse swap: WETH → USDC

Chọn **WETH → USDC**, bắt đầu với **0.00001 WETH** (hoặc 0.0001 nếu balance đủ). Chỉ dùng WETH đã nhận trong ví. Làm lại chuỗi: quote → Review approval nếu cần → submit/check/ack approval → quote mới → Review swap → submit/check/ack swap. Approval spender vẫn là router; transaction target approval lần này là WETH contract. Nếu WETH nhận được ít hơn mức nhỏ nhất được hỗ trợ, dừng và gửi báo cáo; không bỏ kiểm tra balance hoặc tự chọn token khác.

## 6. Kiểm tra rejection, reload và sự cố

- **Reject:** trong một popup approval/swap đã review, chọn Reject. Không được có giao dịch gửi tự động sau đó. Lấy quote mới để thử tiếp.
- **Pending/reload:** khi đã có hash, reload page. Phải còn original wallet/action/hash, không tự mở MetaMask hay gửi lại. Nhấn Check original transaction.
- **Outcome uncertain, chưa có hash:** mở MetaMask → Activity, tìm giao dịch gốc đúng mạng/action/nonce. Copy transaction hash vào **Original transaction hash**, nhấn **Recover original hash**. Không gửi một giao dịch thay thế để “thử lại”.
- **503/429:** nếu chưa gửi, chờ rồi lấy quote mới; không spam nhiều tab. Ghi endpoint, HTTP status và sanitized code từ Network. Không cần chạy lại toàn bộ checklist CLI. Một lỗi RPC không được biến thành quote cũ có thể gửi.
- **API restart/context 410:** context gốc chỉ nằm trong memory API và có thời hạn 24 giờ. Giữ hash/Activity/explorer; không xóa local recovery hoặc tự tạo context mới. Gửi báo cáo để xử lý trước giao dịch tiếp theo.
- **Unverified/reorged/allowance mismatch:** giữ hash và dừng nghiệm thu; trạng thái đó không được coi là success. Receipt bị thiếu quyền xác minh không chứng minh giao dịch chưa gửi.

## 7. Gửi lại kết quả để chốt mốc demo

Chỉ cần một báo cáo gọn (không cần chạy lại mọi script):

| Mục | Bạn ghi lại |
|---|---|
| Setup | Đúng Base Sepolia, faucet ETH/USDC đã nhận, opt-in label hiện |
| Forward | Approval hash nếu có; swap hash; input/minimum/verified output; ≥2 confirmations |
| Reverse | Approval hash nếu có; swap hash; input/minimum/verified output; ≥2 confirmations |
| Phí/allowance | UI L2 gas cost, explorer charged fee, current allowance/mismatch nếu có |
| UI/recovery | Reject không gửi tiếp; reload giữ hash gốc; ảnh/lỗi nếu không đúng |

Bạn có thể gửi public hashes và screenshot; không gửi seed phrase/private key/API key/RPC URL có key. Hoàn thành bước này sẽ chốt **mốc demo swap sớm**, chưa chốt toàn bộ DEX/LP. Lộ trình tiếp theo là [Phase 4–6 của kế hoạch đầy đủ](../superpowers/plans/2026-10-01-standalone-testnet-completion.md).

## Nếu approval báo unverified do smart account

Đọc [hướng dẫn Demo01 và ví thường](2026-10-02-demo-01-and-standard-wallet.md). Giữ hash, kiểm tra receipt mới, dùng **Archive approval for manual review** chỉ khi approval hiện unverified. Hồ sơ vẫn được giữ và ví cũ bị chặn; không coi đó là verified. Tiếp tục với **tài khoản thường khác**, faucet vào địa chỉ mới. Mở `/demo/1` để quay video; `/testnet` để kiểm tra kỹ thuật. Không xóa localStorage để bỏ qua recovery. Nếu mất context sau restartAPI hoặc hết24h, dừng và gửi mã lỗi.
