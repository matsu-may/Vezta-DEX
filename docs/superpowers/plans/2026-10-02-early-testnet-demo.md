# Lộ trình demo testnet sớm

**Ngày:** 2026-10-02. **Trạng thái:** bước 1 và kiểm tra local/browser của bước 2 đã hoàn thành; bước 3 chờ bạn nghiệm thu bằng MetaMask. Chưa có giao dịch public-testnet được nghiệm thu.

**Mục tiêu:** có bản desktop để trình diễn luồng **khám phá pool → kết nối MetaMask → swap → xem kết quả**, trước khi hoàn thiện LP. Sau mốc demo sớm, tiếp tục [lộ trình testnet đầy đủ](2026-10-01-standalone-testnet-completion.md); các yêu cầu và gate còn lại vẫn được giữ.

## Phạm vi mốc đầu

- Standalone trong `vezta-dex`; Base Sepolia 84532, USDC/WETH, pool Uniswap v3 fee 3000 đã xác minh.
- Một trang `/testnet` có thẻ pool/Explore gọn và panel swap hai chiều. Hiển thị chain, phí pool, nguồn/block/thời điểm đọc và liên kết sang swap; không cần bảng xếp hạng token, biểu đồ hay nhiều pool ở mốc này.
- Desktop dùng brand/layout của `vezta-tokenlaunchpad`, đủ rõ để review số tiền nhận, minimum, approval, gas và receipt. Mobile hoàn thiện sau.
- Các mức input đã được policy hỗ trợ; dùng 1 USDC và mức WETH nhỏ phù hợp để nghiệm thu. Giữ exact approval/reset, deadline 30 giây, recheck, simulation và original-hash tracking.
- Demo sớm chưa bao gồm LP trên Base Sepolia, mainnet, multi-chain execution, tích hợp Vezta chính hoặc public hosting. `/demo` mô phỏng vẫn phải có nhãn riêng; không dùng kết quả mô phỏng để đánh dấu giao dịch testnet thành công.

## Ba bước để có demo sớm

| Bước | Công việc | Điều kiện đạt |
|---|---|---|
| **1. Nối và hiển thị** | Thêm browser client/proxy same-origin có timeout/body/rate budget; nối controller có sẵn vào `/testnet`; thẻ pool và swap dùng chung identity Base Sepolia. Giữ execution tắt trong quá trình nối. | Có thể xem pool, connect, lấy quote, review reset/approval/swap và theo dõi context/hash gốc. Không tự bật ví/gửi giao dịch khi tải trang. |
| **2. Kiểm tra một nhóm** | Mock browser cho hai chiều, hết hạn, đổi account/chain, rejection, pending/reload/uncertain và không gửi lặp; kiểm tra thời gian quote→recheck→ví. Qualify gate gửi testnet cục bộ, compatibility và complete fee budget cho giao dịch thử có giới hạn. | Test/typecheck/lint/build và desktop browser đạt; quote cũ/minimum/deadline không bị nới để vượt lỗi. Chỉ cấu hình opt-in testnet được xét bật; server không ký/gửi thay ví. |
| **3. Bạn nghiệm thu testnet** | Dùng ETH testnet và USDC testnet từ faucet, ký giao dịch thử nhỏ theo hướng dẫn; xác minh forward swap rồi reverse từ WETH nhận được. Ghi receipt, số tiền, gas/charged fees và allowance. | Hai chiều thành công với original receipt verified; trạng thái lỗi/recovery rõ; phí công khai được đối chiếu hoặc ghi thiếu sót cụ thể. Một checklist setup/start/demo dùng lại được. |

**Ước lượng ban đầu (đã triển khai phần độc lập):** khoảng 1½–3 ngày làm việc tập trung cho code và kiểm tra của bước 1–2, dựa trên nền tảng hiện có. Đây là ước lượng; RPC, quote latency, tương thích ví và lỗi phát sinh có thể kéo dài. Bước 3 phụ thuộc thời gian bạn có thể kiểm tra và lấy tài sản testnet; không cần USDC mainnet.

**Điểm dừng:** nếu thiếu điều kiện gửi, chỉ trình diễn preview/mock có nhãn rõ và ghi gate chưa đạt. Chưa gọi đó là bản swap public-testnet đã nghiệm thu. Không dùng tốc độ demo để bỏ validation hoặc tự gửi qua ví của bạn.

## Sau demo sớm: trở lại lộ trình đầy đủ

1. Đối chiếu bằng chứng demo với **Phase 1–3** của kế hoạch cũ, đánh dấu đúng những mục đã đạt; hoàn thiện expiry/discovery, wallet/recovery và public receipt/fee gates còn thiếu.
2. Thực hiện **Phase 4 — LP**: owner-bound reads/math, mint, increase, partial/full decrease, collect và close/burn; fork rồi nghiệm thu testnet bằng NFT của ví.
3. Thực hiện **Phase 5 — sản phẩm desktop**: Explore/pool detail, swap, positions/LP thống nhất; đầy đủ trạng thái, ranh giới truy cập/rate budget và vận hành.
4. Thực hiện **Phase 6 — bàn giao**: checklist nghiệm thu toàn task, bằng chứng browser/fork/public testnet, setup/reset và giới hạn. Mobile, mainnet và tích hợp Vezta nằm ở các mốc sau.

**Tối ưu thực hiện:** tái sử dụng core/backend/controller; không clone AMM/router, rebuild nguồn hoặc chạy lại các probe đã đạt. Làm một nhóm chức năng, một review và một gate cuối; chỉ kiểm tra lại phần có rủi ro cụ thể do thay đổi. Gate runtime/fork được chấp nhận vẫn được kiểm tra lúc chạy theo policy, không được bỏ khỏi adapter.

## Trạng thái bàn giao hiện tại

- Bước 1: client/proxy bounded same-origin, local opt-in launcher và desktop `/testnet` đã nối controller. Quote/minimum, exact/reset approval, fee review, explicit submit và original receipt/recovery có UI.
- Bước 2 local: 757 Vitest +85 Node passed (1 native opt-in integration skipped), typecheck/lint/build passed; mock wallet browser15checks và discovery browser8checks passed. Một review độc lập không có Critical/Important; Minor về allowance đã sửa và test.
- Luồng proxy thật: quote200 trong11095ms, approval recheck200 trong7216ms; ví thiếu input được báo blocked đúng, execution=false trong dev thường. Latency của funded wallet và popup MetaMask vẫn cần quan sát ở bước3; không nới TTL30s/minimum.
- Chỉ `pnpm dev:testnet` mới bật consumer testnet trên localhost. `pnpm dev` vẫn preview; CLI/source gates vẫn read-only. Không public hosting, mainnet hay server-side signing.
- Làm [hướng dẫn bước3](../../research/2026-10-02-early-testnet-demo-owner-guide.md), gửi sanitized hashes/results, rồi tiếp tục LP và Phase4–6. Không chạy lại các source rebuild/fork đã đạt nếu code liên quan không thay đổi.
- [Checkpoint phiên](../../research/2026-10-02-early-demo-browser-session.md) giữ context/decisions/giới hạn để tiếp tục sau compaction. Thay đổi riêng `apps/web/next-env.d.ts` được giữ và không commit.
