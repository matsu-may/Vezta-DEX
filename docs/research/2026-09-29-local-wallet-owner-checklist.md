# Checklist kiểm tra ví local — Polygon USDC → WETH

**Trạng thái:** Đã triển khai harness được chủ dự án duyệt; kiểm tra browser thật và giao dịch có tiền vẫn chưa thực hiện. `/swap` công khai tiếp tục chỉ đọc. Đây là checklist do bạn thao tác; agent không ký, gửi giao dịch hay nạp tiền.

## 1. Khởi động đúng chế độ

Từ `vezta-dex/`, giữ API key trong `apps/api/.env`. Không gửi nội dung file này vào chat.

```bash
# Terminal 1: khởi động lại API để dùng code mới
pnpm --filter @vezta-dex/api start

# Terminal 2: dừng web cũ trên 3020 bằng Ctrl+C trước
pnpm dev:rehearsal
```

Mở **http://127.0.0.1:3020/rehearsal**. Launcher chỉ bind `127.0.0.1:3020`; `DEX_API_URL` phải là `http://127.0.0.1:3021` hoặc `http://localhost:3021`. Không chép các flag rehearsal vào `.env.local`, proxy công khai hoặc server khác. Chạy `pnpm dev` bình thường và production không bật harness.

Agent bị môi trường chặn mở cổng local (`listen EPERM`), nên chưa xác nhận giao diện thực tế hoặc header do Next gửi. Nếu page/proxy lỗi, dừng tại đó và gửi HTTP status/thông báo đã che thông tin nhạy cảm; không bỏ gate để tiếp tục.

## 2. Browser mock trước, chưa dùng ví thật

Chạy với profile mới trong bộ nhớ. Script cài ví giả và chặn toàn bộ API của rehearsal; không dùng profile có MetaMask thật. API thật không cần phục vụ dữ liệu cho phép thử này.

```bash
playwright-cli -s=dex-mock open http://127.0.0.1:3020/rehearsal
playwright-cli -s=dex-mock run-code --filename=scripts/smoke-rehearsal-browser.js
playwright-cli -s=dex-mock close
```

Kết quả mong đợi: JSON `mockOnly: true`, các checks qua, ảnh desktop/mobile trong `.playwright-cli/`. Kiểm tra ảnh: không tràn ngang, amount/minimum/gas/hash đọc được, các nút có tên rõ. Script **chưa được agent chạy trong browser**, chỉ đã kiểm tra cú pháp. Nếu công cụ chưa cài, dùng bộ Playwright CLI đã cấu hình cho workspace; không tự thêm extension vào profile ví.

## 3. Kiểm tra ví thật trước khi gửi tiền

Dùng tab trình duyệt bình thường riêng; ghi phiên bản browser và MetaMask. Chọn một EOA thử nghiệm riêng trên Polygon 137, không có deployed code/delegation. Harness chỉ nhận native USDC → WETH, tối đa **1 USDC**, mặc định slippage 0.5%.

- Mở trang không được tự yêu cầu ký hoặc gửi giao dịch.
- **Connect Polygon wallet** → **Get rehearsal quote**: đúng account, token, chain; thấy input, estimated/minimum output, allowance, expiry.
- Đổi account/network hoặc amount/slippage: quote/permit cũ phải mất. Sai chain không được mở prompt gửi.
- Chờ quote quá 30 giây: yêu cầu quote mới, không dùng quote/signature cũ.
- Từ chối prompt kết nối/approval/signature/broadcast khi gặp bước đó: không tự tiếp tục, không tự gửi lại. Một số trường hợp cần có allowance đúng hoặc balance thử nghiệm trước mới tới được prompt.
- Allowance ERC20 khác zero và khác đúng amount phải bị chặn; không tự revoke/reset. Thiếu USDC/POL, lỗi RPC hoặc simulation phải chặn hành động.

Không cố tạo failure bằng giao dịch thật; chỉ các trạng thái an toàn có sẵn cần kiểm tra thủ công. Account đổi trong prompt phải hủy các bước tiếp theo; nếu giao dịch đã gửi, giữ và kiểm tra hash của account ban đầu.

## 4. Rehearsal có tiền — chỉ khi bạn sẵn sàng

Bạn tự quyết định nạp tối đa 1 native USDC và lượng POL nhỏ đủ cho gas hiển thị. Không có chi phí gas cố định được cam kết. Hãy xem kỹ từng prompt; có thể từ chối bất cứ lúc nào.

1. Lấy quote cho **1 USDC**. Nếu allowance zero, **Approve exact USDC amount**; kiểm tra chain Polygon, token USDC, spender Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3`, đúng 1,000,000 base units, không unlimited, value 0, gas trong ví.
2. Giữ hash; **Check original transaction**. Chờ hai canonical confirmations và trạng thái **Approval verified; requote required**. Backend phải xác minh calldata, receipt và allowance thực tế. Nếu đã exact allowance, không cần approval mới.
3. **Clear verified record for a new quote**, lấy và đọc quote mới. **Review Permit2** → **Sign reviewed Permit2** khi cần: đúng token/amount/router, lifetime allowance tối đa 30 ngày, signature deadline tối đa 30 phút. Quote chỉ 30 giây; prompt lâu có thể yêu cầu quote mới, không nới TTL.
4. **Prepare and simulate swap**: thấy minimum output, router `0xDc264714F68d84CF29BC605589405E78bDBE7C9f`, value 0 POL, gas và simulation block. Lỗi/expired không được mở prompt broadcast.
5. **Submit reviewed swap**: phần mềm recheck state/simulation; nếu gas tăng phải review và click lại. Ví là bước xác nhận cuối. Sau gửi giữ hash, không bấm gửi lại khi chưa biết kết quả.
6. Chờ **Swap execution verified**; so executed output với minimum đã chấp nhận, USDC vào đúng amount, gas và balances của account ban đầu tại receipt block. Kiểm tra transaction/Transfer/allowance trên Polygon explorer. Quote UI Uniswap chỉ dùng để đối chiếu mức giá tại thời điểm tương ứng, không chứng minh giao dịch đã chạy.

## 5. Chậm, reload, revert và replacement

- 60 giây chưa có kết quả là delayed; dùng **Check original transaction**, không gửi lại. Hai confirmations chỉ là tiêu chí quan sát local, không phải finality không thể đảo ngược.
- Reload sau hash: chỉ phục hồi metadata và theo dõi account/hash cũ, không tự ký/gửi. Reload khi wallet chưa trả hash: kiểm tra MetaMask Activity trước, nhập **Original transaction hash** → **Recover original hash**. Actual calldata digest/owner/amount phải khớp trước khi xác nhận.
- Revert đã được xác minh: xem gas và balances; receipt thành công không tự chứng minh đủ output. Trạng thái unverified cần điều tra, không clear để thử lại.
- Speed-up/cancel/replacement chưa có tự động xác minh. Giữ các hash liên quan và kiểm tra activity/explorer; không thay hash bằng giao dịch khác để vượt gate.
- Recovery storage lỗi hoặc hash không rõ: kiểm tra lịch sử ví trước. Không xóa localStorage để bỏ qua một giao dịch có thể đã gửi. Nếu xác minh được wallet chưa gửi nhưng marker vẫn uncertain, báo lại để lập cách khôi phục cụ thể.

## 6. Evidence bạn có thể gửi

Ghi: browser/MetaMask version, account đã che, chain, loại thao tác, input/minimum/output dạng integer, quote/block/time, public transaction hash, receipt outcome/confirmations, gasUsed/effectiveGasPrice/gasCost, allowance sau approval/swap, reload/rejection/change kết quả. **Không gửi seed, private key, API key, raw signature hoặc raw request/calldata có signature.**

Một giao dịch USDC → WETH đúng chưa hoàn tất gate hai chiều, production recovery/finality hoặc LP. Reverse funded rehearsal cần runbook riêng; harness này không có return swap tự động. Dừng nếu chain/account/spender/amount/permission khác dự kiến hoặc kết quả không xác minh được.
