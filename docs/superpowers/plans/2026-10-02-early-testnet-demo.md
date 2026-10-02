# Lộ trình demo testnet sớm

**Ngày:** 2026-10-02. **Trạng thái:** kế hoạch, chưa phải bản demo đã nghiệm thu.

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

**Thời gian tham khảo:** khoảng 1½–3 ngày làm việc tập trung cho code và kiểm tra của bước 1–2, dựa trên nền tảng hiện có. Đây là ước lượng; RPC, quote latency, tương thích ví và lỗi phát sinh có thể kéo dài. Bước 3 phụ thuộc thời gian bạn có thể kiểm tra và lấy tài sản testnet; không cần USDC mainnet.

**Điểm dừng:** nếu thiếu điều kiện gửi, chỉ trình diễn preview/mock có nhãn rõ và ghi gate chưa đạt. Chưa gọi đó là bản swap public-testnet đã nghiệm thu. Không dùng tốc độ demo để bỏ validation hoặc tự gửi qua ví của bạn.

## Sau demo sớm: trở lại lộ trình đầy đủ

1. Đối chiếu bằng chứng demo với **Phase 1–3** của kế hoạch cũ, đánh dấu đúng những mục đã đạt; hoàn thiện expiry/discovery, wallet/recovery và public receipt/fee gates còn thiếu.
2. Thực hiện **Phase 4 — LP**: owner-bound reads/math, mint, increase, partial/full decrease, collect và close/burn; fork rồi nghiệm thu testnet bằng NFT của ví.
3. Thực hiện **Phase 5 — sản phẩm desktop**: Explore/pool detail, swap, positions/LP thống nhất; đầy đủ trạng thái, ranh giới truy cập/rate budget và vận hành.
4. Thực hiện **Phase 6 — bàn giao**: checklist nghiệm thu toàn task, bằng chứng browser/fork/public testnet, setup/reset và giới hạn. Mobile, mainnet và tích hợp Vezta nằm ở các mốc sau.

**Tối ưu thực hiện:** tái sử dụng core/backend/controller; không clone AMM/router, rebuild nguồn hoặc chạy lại các probe đã đạt. Làm một nhóm chức năng, một review và một gate cuối; chỉ kiểm tra lại phần có rủi ro cụ thể do thay đổi. Gate runtime/fork được chấp nhận vẫn được kiểm tra lúc chạy theo policy, không được bỏ khỏi adapter.

## Điểm bắt đầu cho phiên code tiếp theo

Đọc [bàn giao controller](../../research/2026-10-02-testnet-wallet-controller.md), rồi làm bước 1. Đã chấp nhận fork `47573721` và consumer fork `47574990`; controller ở commit `5f1d159` có 746 Vitest +85 Node passed. UI chưa nối controller và product execution vẫn false. Giữ thay đổi riêng của chủ repo trong `apps/web/next-env.d.ts`. Phiên lưu lộ trình này chỉ sửa Markdown.
