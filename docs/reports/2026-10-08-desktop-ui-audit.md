# Desktop UI/UX Audit — Vezta DEX

## Phạm vi và kết quả

Ngày: 2026-10-08. Đây là báo cáo rà soát và đề xuất, chưa triển khai sửa frontend.

Dùng Playwright CLI trong browser riêng trên server local đang chạy. Đối chiếu screenshot Uniswap tại `docs/reports/uniswap/`. Kiểm tra bố cục desktop ở 1440 px; kiểm tra thêm header Swap ở 1280/1024 px. Các trang chính tại 1440 px và header Swap ở hai kích thước bổ sung không gây tràn ngang.

Đã xem Swap, Explore Tokens/Pools/Transactions/Auctions, Pool detail, Positions khi chưa đọc và khi có dữ liệu, Position detail, Create position full/custom range, Launch auction, menu Explore/Pool, popup ví/token, đổi workspace chain và lỗi wallet khác chain. Quote/review và dữ liệu NFT dùng fixture mock; không ký/gửi giao dịch, không chạy lại fork hoặc bộ test toàn repository. Đây không phải nghiệm thu wallet lifecycle hay mobile.

## Những điểm cần chỉnh

| Ưu tiên | Quan sát | Đề xuất |
|---|---|---|
| P1 | Chain select cao 38 px, wallet button 40 px. Cùng tâm Y=39 px nhưng icon chain có tâm Y=42 px. CSS đặt icon tuyệt đối ở `top:12px`. | Dùng chiều cao 40 px chung; căn icon/text/chevron theo flex hoặc tâm phần tử. Giữ chiều rộng ổn định giữa connected/disconnected. |
| P1 | Reverse button đúng tâm giữa hai card, nhưng dùng ký tự `↓`, nét/glyph phụ thuộc font. | SVG ArrowDown 24 px trong nút 44 px, padding/border cân xứng; hover/focus/disabled rõ. Căn hai dòng amount/token và thống nhất kích thước card. |
| P1 | Select chain là native select; đổi workspace chưa đổi mạng ví. Sai mạng chỉ được giải thích rõ khi connect. | Popover network có logo, tên, chain ID, Testnet và dấu chọn. Trigger gọn; ghi giới hạn EOA của Unichain trong menu. Hiện sai mạng và nút Switch network rõ ràng, chỉ prompt khi người dùng bấm. |
| P1 | Nút submit sticky ở popup review che dòng quote expiry tại cuối popup. | Footer riêng có nền kín, khoảng đệm và vùng chứa expiry + CTA. Body cuộn độc lập; thông tin minimum, chain, recipient và fee luôn đọc được trước khi gửi. |
| P1 | Token popup có search input chỉ rộng khoảng nửa phần nội dung; wallet/token popup dùng kiểu close button khác nhau. | Search rộng toàn popup; chung kích thước, padding, close icon và focus treatment. Highlight token đang chọn. |
| P2 | Swap có hướng dẫn lặp ở phía trên; sau quote, provenance và khoảng cách đẩy CTA khá sâu. | Giữ form tập trung, gom một dòng trạng thái ví; thu gọn route/provenance vào details. Minimum và expiry luôn hiện; số dài có cách xem đầy đủ. CTA phù hợp khi chưa có MetaMask. |
| P2 | `/explore`, `/pools`, `/pool` không đánh dấu active mục header. Hover menu đã mở được. | Dùng mapping route thống nhất cho active navigation và breadcrumb; chuẩn hóa SVG chevron và khoảng cách menu. |
| P2 | Bảng Pools căn phải mọi cột từ cột 3, gồm cả nội dung mô tả; tiêu đề/row nhìn lệch. | Căn trái cột mô tả, căn phải số; thống nhất padding, row height và toolbar search/action. Dùng badge gọn cho LP support/data status. |
| P2 | Pool detail lặp pair/network và nhiều đoạn nói market data unavailable. | Một identity header, một sample panel, sidebar facts/links gọn. Gom chú thích dữ liệu; phân biệt pool sample với wallet quote. |
| P2 | Positions dùng form địa chỉ toàn chiều rộng; detail lặp `Position #42` ba lần và giữ nguyên cấu trúc list. | Toolbar owner/read gọn, quyền đọc ví khác vẫn có. List dùng summary card; detail dùng một tiêu đề, nhóm principal/fees/owed riêng và action area rõ. |
| P2 | Create position lặp tiêu đề; range diagram đặt trước range controls; chú thích kỹ thuật dài. | Chọn Full/Custom trước, sau đó range inputs/diagram và deposit caps. Giữ stepper; giải thích snapped bounds gần input, ticks trong details. Cap, planned deposit và minimum tiếp tục là ba khái niệm riêng. |
| P2 | Radius, button, input và typography khác nhau giữa trang/popups; nhiều lớp CSS override. | Chuẩn hóa token spacing, radius, control height và shared primitives trước khi chỉnh từng feature. Giảm override trùng trong phạm vi product UI. |

## Thứ tự triển khai đề xuất

1. **Shared controls:** header alignment, SVG icons, network popover, wallet/token modal và popup footer. Đây là nhóm trực tiếp xử lý những điểm người dùng phản ánh.
2. **Swap:** card geometry, amount formatting, CTA, trạng thái chưa connect/sai mạng/quote hết hạn, review hierarchy.
3. **Explore & Pool:** bảng, toolbar, active navigation, detail layout và empty/error states.
4. **Positions & Create:** list/detail riêng, owner toolbar, range/deposit layout, tăng/giảm/collect/close action presentation.
5. **Kiểm tra cuối:** screenshot desktop 1440/1280/1024 px, Tab/Escape/focus, số dài, loading/error, và regression tests chỉ cho hành vi UI được thay đổi. Full gates chạy một lần sau cùng nếu triển khai.

## Quy tắc khi triển khai

Giữ phong cách bố cục Uniswap với nền tối và accent Vezta `#D4FF2B`. Chỉ hiển thị chain/token/pool được hỗ trợ; Auctions tiếp tục là trang giải thích chưa hỗ trợ. Không dựng USD price, TVL, APR hoặc chart từ dữ liệu không có.

Đổi chain phải tiếp tục chặn khi còn original transaction cần recovery, bỏ hiệu lực review cũ và không tự mở wallet prompt. Preserve exact approvals, expiry, simulation, execution gates và original-hash recovery. Bố cục gọn không được làm minimum/authorization/recipient khó kiểm tra. Mobile hoàn thiện sau theo ưu tiên hiện tại.

Artifacts audit tạm nằm ở `/tmp/vezta-ui-audit/`; chúng chứa trạng thái mock và có thể bị hệ thống xóa. Screenshot của người dùng và các thay đổi tổ chức repository trước đó được giữ nguyên.
