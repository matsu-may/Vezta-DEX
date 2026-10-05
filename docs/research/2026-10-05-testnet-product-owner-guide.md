# Kiểm tra phần nâng cấp DEX testnet

Các luồng cũ bạn đã xác nhận pass vẫn được ghi nhận. Hướng dẫn này chỉ kiểm tra
số tiền/slippage tùy chọn, range LP, Explore nhiều pool, routing và lịch sử mới. Chỉ dùng
test token trên **Base Sepolia 84532**. Frontend Vercel hiện tại chưa nhận bản này.

## 1. Mở bản mới

Code đã kiểm tra nằm trên nhánh `codex/testnet-product-completion` trong worktree
riêng. Chưa áp dụng vào checkout `main` đang dùng để tránh watcher khởi động lại
API khi bạn đang theo dõi một hash. Hoàn tất/acknowledge các giao dịch đang theo dõi
trước khi dừng dev hoặc áp dụng bản mới. Giữ hash/context gốc nếu chưa xác minh.

Khi không còn giao dịch cần recovery, dừng launcher cũ bằng Ctrl-C, rồi:

```bash
cd /Users/thongtran/Vezta/vezta-dex
git merge --ff-only codex/testnet-product-completion
pnpm install --frozen-lockfile --store-dir /Users/thongtran/Vezta/.pnpm-store
pnpm dev:testnet
```

Không chạy hai launcher cùng lúc. Giữ nguyên các file môi trường riêng của bạn.
Không cần push GitHub hoặc deploy Vercel để kiểm tra local. Nếu git báo conflict,
giữ nguyên thay đổi và gửi tên file; không dùng reset/clean để xử lý.

Mở `http://127.0.0.1:3020/demo/1`, Connect wallet → MetaMask. Dùng cùng hostname
và tài khoản có test USDC, WETH và test ETH. Hướng dẫn cũ về approval/recovery vẫn
áp dụng: có hash thì kiểm tra hash gốc, không gửi lại để thử.

## 2. Swap số tiền và slippage mới

1. Chọn USDC → WETH; nhập **0.123456 USDC**, nếu ví đủ.
2. Mở **Swap settings**; nhập **0.25** ở Slippage tolerance (%) — đây là 0,25%,
   không phải 25%. Phạm vi hỗ trợ 0,05–1%; mặc định 0,5%.
3. Get wallet quote. Kiểm tra input, slippage và Minimum received.
4. Nếu đổi amount hoặc slippage trước submit, review cũ phải mất hiệu lực.
5. Lấy quote mới, review approval nếu cần, xác minh/acknowledge approval, rồi lấy
   quote mới → Review swap → submit → Check original transaction.
6. Khi confirmed, output thực nhận phải đạt minimum của quote được dùng. Acknowledge.
7. Không gửi giao dịch để thử lỗi nhập: `1.0000001` USDC, `6` USDC hoặc slippage
   `1.01` phải bị chặn. Đổi hướng thử `0.00012345` WETH; đây là kiểm tra quote,
   không bắt buộc gửi thêm swap nếu ví không đủ.

Giới hạn swap: 5 USDC / 0,001 WETH. Quote/simulation vẫn có thể từ chối lượng
trong giới hạn nếu thiếu số dư, depth không đạt hoặc RPC lỗi.

## 3. Range LP tùy chọn

Mở `/demo/2` → Connect wallet → Create position → Position range:
**Custom price range**. Đơn vị hai ô là **USDC cho 1 WETH**, không phải WETH/USDC.

1. Chọn lower/upper theo giá pool testnet bạn muốn thử; lower phải nhỏ hơn upper.
   Không lấy giá mainnet làm giá testnet. App không tự chọn chiến lược đầu tư.
2. Kiểm tra **Actual snapped bounds** và ticks. Bounds thực tế có thể rộng hơn
   số nhập vì snap theo tick spacing 60; hai ticks phải trùng phần review.
3. Bắt đầu bằng cap nhỏ, ví dụ **0,1 USDC / 0,0001 WETH**, nếu đủ số dư. Đây là
   maximum authorization, không đảm bảo app sẽ dùng hết cả hai token.
4. Study LP action; kiểm tra planned/minimum deposit, range và fee budget.
   Nếu ngoài range, có thể chỉ cần một token; đọc Single-sided deposit. Có thể
   đặt cap token không sử dụng về 0. Không submit khi review không đúng ý bạn.
5. Hoàn tất từng reset/approval được yêu cầu; sau mỗi kết quả xác minh hãy
   acknowledge và Study lại, cho đến Review mint. Submit mint, xác minh NFT ID
   và Actual tokens deposited, rồi acknowledge và Read LP positions.
6. Increase nhỏ cho NFT mới: review phải giữ nguyên range NFT, không áp dụng
   một range khác. Hoàn tất approval nếu cần và xác minh actual deposit.
7. Decrease 50% → acknowledge → đọc lại; sau đó decrease 100% → acknowledge →
   đọc lại. Decrease ghi vốn vào owed, chưa trả token về ví.
8. Collect → xác minh token về ví → acknowledge → đọc lại. Khoản collect có thể
   gồm vốn đã rút và phí. Burn NFT trống là kiểm tra bổ sung, không cần lặp lại
   toàn bộ các vị thế cũ.

Không ký để thử lỗi range: đảo lower/upper hoặc sửa giá sau study. Study/submit
phải bị chặn hoặc review cũ bị xóa. NFT ngoài range vẫn hợp lệ nhưng không tạo
thanh khoản hoạt động/thu phí cho đến khi giá vào range.

## 4. Explore và detail

Mở `/demo/3` → Refresh pool data. Kiểm tra các fee tier quan sát được, tìm theo
address/fee, lọc status và đổi thứ tự fee. Chọn pool khác → View detail:
`/demo/4?fee=...&pool=...` phải giữ đúng address/fee sau refresh.

Bốn pool có fee 0,01% / 0,05% / 0,3% / 1% đã có bằng chứng runtime riêng.
Khi snapshot đạt điều kiện, nút Swap mở đúng cặp fee/address; quote còn phải
kiểm tra trạng thái mới, runtime và impact. LP vẫn chỉ dùng pool 0,3%. Search/filter che pool đang chọn thì
không được còn nút giao dịch cho lựa chọn bị che. Không hiển thị TVL/APR giả.

## 5. Local activity và recovery

Sau swap/LP mới, mở **Local activity**. Hash/status phải đúng kết quả vừa kiểm
tra; acknowledge không xóa lịch sử. Reload giữ lịch sử và không tự gửi giao dịch.
Đổi account phải không hiển thị lịch sử account trước. Dữ liệu chỉ thuộc trình
duyệt này, không phải toàn bộ lịch sử blockchain; status là lần quan sát cuối.

Phí trước ký là **Complete snapshot fee budget** (ước tính). Lịch sử chỉ ghi
**L2 gas cost** từ receipt; chưa có tổng charged L1/operator fee được xác minh.
Gas payer có thể là relayer khi dùng MetaMask delegation. Không hiểu L2 cost
của relayer là toàn bộ số tiền app đã trừ từ ví bạn.

## 6. Routing mới — kiểm tra sau cũng được

1. Mở `/demo/1`, giữ **Pinned pool · 0.3% (original)** để thấy mặc định cũ.
2. Trong **Swap settings → Routing preference**, chọn mục so sánh direct pools.
   Bắt đầu **0,1 USDC**; nếu impact vượt 1%, giảm amount, không tăng slippage
   để né kiểm tra impact. Quote không cần ví có USDC, nhưng submit cần test token.
3. Get wallet quote → mở **Selected route**. Kiểm tra nhãn Base Sepolia, fee,
   address, số pool qualified và output từng pool. Pool thắng phải có output lớn
   nhất trong các pool qualified. Pool unavailable không được tính là thắng.
   Đây là output trước gas, không phải báo giá tốt nhất toàn thị trường.
4. Đổi amount hoặc routing preference: quote/review cũ phải mất hiệu lực.
5. Với một quote mới đã review, làm approval nếu cần → acknowledge → quote mới
   → Review swap → submit → Check original transaction → confirmed. Đối chiếu
   output thực nhận với minimum của **quote dùng để submit**. Acknowledge.
6. Có thể kết hợp kiểm tra reload ngay sau khi có hash ở bước trên: ghi hash,
   reload rồi Check original transaction. Phải giữ nguyên hash/pool/fee; không
   tự gửi hoặc chọn pool khác. Giữ API chạy khi theo dõi hash.
7. Explore/detail → chọn pool khác → Swap. URL phải chứa đúng cả fee/address,
   Routing preference phải chọn đúng fee. Quote có thể từ chối nếu depth hiện
   tại không đạt. Không cần gửi cả bốn pool chỉ để kiểm tra navigation.
8. WETH → USDC với lượng nhỏ, ví dụ 0,0001 WETH: kiểm tra comparison/minimum.
   Một receipt ở pool mới là kiểm tra chính của vòng này; public receipt mỗi pool
   được chọn vẫn là bằng chứng riêng còn cần nếu muốn nghiệm thu tất cả bốn pool.

Không phải chạy lại compiler rebuild/fork chẩn đoán mình đã hoàn tất. Browser
mock/fork không thay thế xác nhận MetaMask thực tế ở các pool mới.

## 7. Báo kết quả và bước kế tiếp

```text
Custom amount/slippage: đạt hoặc lỗi + hash nếu đã gửi
Custom LP mint: status + NFT ID + hash
Increase / decrease / collect NFT mới: đạt hoặc lỗi + hash
Explore/search/filter/detail: đạt hoặc lỗi
Activity/reload/account isolation: đạt hoặc lỗi
Direct-pool comparison / selected-pool link: đạt hoặc lỗi
New-pool swap / reload original hash: status + fee + hash
UI desktop: điểm cần sửa nếu có
```

`unverified`/`reorged`/outcome uncertain: giữ record và hash, không gửi lại.
`503`: gửi safe code và endpoint trong Network; không gửi key/RPC URL có credentials.

Sau nghiệm thu phần mới mới chốt giai đoạn 6. Giai đoạn 7 đã triển khai và kiểm
tra độc lập, còn nghiệm thu ví thật trên các pool mới. Giai đoạn 8 đã khảo sát
Ethereum Sepolia và Unichain Sepolia; cần bạn chọn chain trước khi thêm adapter. Không xem nhiều pool hiển thị hoặc
Polygon read-only là bằng chứng giao dịch nhiều chain.
