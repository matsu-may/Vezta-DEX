# Desktop UI/UX Polish — Vezta DEX

Ngày: 2026-10-08. Thực hiện theo [audit được duyệt](2026-10-08-desktop-ui-audit.md) và [plan](../superpowers/plans/2026-10-08-desktop-ui-polish.md).

## Đã chỉnh

- **Header:** nút mạng/ví cao 40 px, logo và chevron thẳng tâm. Menu mạng có tên, chain ID, dấu chọn và giới hạn EOA của Unichain. Hỗ trợ Arrow/Tab/Escape; khóa đổi workspace khi còn giao dịch cần recovery.
- **Ví/token:** popup thống nhất close icon, padding và focus. Tìm token rộng toàn popup, đánh dấu token đang chọn. Hiện mạng ví khác workspace sau thao tác connect; đổi account giữ thông tin chain, disconnect xóa nó.
- **Swap:** Sell/Buy cùng kích thước, arrow SVG 24 px trong nút 44 px; chỉnh CTA, khoảng cách và typography. Có nút mở chooser cả khi thiếu MetaMask. Quote minimum vẫn đầy đủ. Review body cuộn riêng, expiry/submit nằm trong footer, không che nội dung.
- **Explore/Pool:** số căn phải, mô tả căn trái; toolbar và badge LP gọn. Alias routes có active navigation. Pool detail chỉ có một identity header, sample riêng, sidebar facts/links và disclosure về dữ liệu chưa có.
- **Positions/LP:** owner/read toolbar gọn; list hiện principal và estimated collectable, detail giữ fees/owed riêng, bỏ tiêu đề NFT lặp. Chọn Full/Custom và nhập bounds trước diagram/deposit caps. Review LP dùng footer riêng; giữ phân biệt maximum authorization, planned deposit, minimum deposit.
- **CSS:** product UI ở `apps/web/app/product.css`, import sau globals; gộp selector trùng. Giao dịch, controller và backend không đổi.

## Các lựa chọn

Menu mạng thay đổi **workspace của app**. Chỉ thao tác explicit trong popup ví mới gọi switch network; mở menu không prompt. Khi bound connect thất bại, một `eth_chainId` read bổ sung hiển thị mạng thực mà không thay đổi quyền của controller.

Giữ exact approvals, expiry, simulation, original hash recovery, owner authority và execution gates. Không tạo TVL/APR/giá USD/chart giả. Mobile hoàn thiện sau.

## Kiểm tra đã chạy

- Playwright mock trên preview riêng: desktop 1440 px, header 1280/1024 px; card/icon alignment, keyboard focus, wrong-chain, popup token, review scroll/footer và position owner restrictions đạt. Không RPC công khai, ký hoặc broadcast.
- Vitest toàn repo: 1.170 pass, 1 skip; một assertion mới sai câu chữ. Sửa assertion và chạy lại đúng suite: **11/11 pass**. Không lặp toàn bộ bộ test mất 97 giây.
- Node script tests: **85/85 pass**.
- Typecheck, lint, build đạt. Lint có warning React auto-detection tại workspace root, không có lỗi.
- Review độc lập không thấy lỗi chặn. Đã sửa finding về chain state khi account thay đổi.
- Dependencies được relink theo frozen lockfile để sửa symlink Next/ESLint hỏng; không đổi version hay lockfile.

## Bạn kiểm tra giao diện

Chạy `pnpm dev` cho preview, hoặc `pnpm dev:testnet` khi cần wallet acceptance. Nếu server đang chạy với transaction cần recovery, giữ API đó chạy.

1. `/swap`: nút mạng/ví thẳng hàng, hai card cân xứng, arrow giữa card. Mở token popup, search tên/address, chọn token và Escape.
2. Menu mạng: xem đúng Base Sepolia 84532 / Unichain Sepolia 1301. Đổi workspace không tự mở MetaMask; khi ví sai chain, popup hướng dẫn switch explicit.
3. Quote → review: xem minimum/amount/network, mở fee details và cuộn. Expiry/submit không chồng lên nội dung; close/reopen và đổi input vẫn làm review cũ mất hiệu lực.
4. `/explore/pools` → pool detail: kiểm tra table/search/links và sample; không nhầm sample với wallet quote.
5. `/positions` → detail → `/positions/create`: owner toolbar, NFT heading, Full/Custom range và deposit caps dễ đọc. Đọc ví khác vẫn không cấp quyền thao tác.

Không cần chạy lại toàn bộ lifecycle chỉ để xem các chỉnh sửa trình bày này. Thay đổi còn ở nhánh `codex/repository-organization`, chưa commit/push/deploy trong phiên này.

## Ảnh đối chiếu

Ảnh dùng fixture mock, không phải bằng chứng giao dịch thực:

- [Swap](desktop-ui-2026-10-08/swap.png) · [Quote](desktop-ui-2026-10-08/quote.png) · [Review khi cuộn](desktop-ui-2026-10-08/review-expanded.png)
- [Menu mạng](desktop-ui-2026-10-08/network.png) · [Token picker](desktop-ui-2026-10-08/token-picker.png) · [Sai mạng ví](desktop-ui-2026-10-08/wallet-mismatch.png)
- [Explore Pools](desktop-ui-2026-10-08/explore-pools.png) · [Pool detail](desktop-ui-2026-10-08/pool-detail.png)
- [Positions](desktop-ui-2026-10-08/positions-filled.png) · [Position detail](desktop-ui-2026-10-08/position-detail.png)
- [Full range](desktop-ui-2026-10-08/create-full.png) · [Custom range](desktop-ui-2026-10-08/create-custom.png) · [Review LP](desktop-ui-2026-10-08/lp-review.png)
