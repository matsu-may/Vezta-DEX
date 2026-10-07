# Nghiệm thu DEX hai testnet — một vòng kiểm tra

## 1. Chạy đúng bản code

Code phiên này nằm trong worktree riêng:

```bash
cd /Users/thongtran/Vezta/.worktrees/vezta-dex-testnet-product
pnpm dev:testnet
```

Nếu còn giao dịch có hash chưa xác minh, giữ server/API gốc để check và
acknowledge trước khi đổi bản chạy; không xóa recovery record.
Sau đó dừng **server DEX cũ do bạn đang chạy** nếu đang chiếm 3020/3021.
Trong `apps/api/.env`, giữ `BASE_SEPOLIA_RPC_URL` và thêm server-only
`UNICHAIN_SEPOLIA_RPC_URL` của provider hỗ trợ chain1301. Public endpoint
`https://sepolia.unichain.org` dùng thử được nhưng không phù hợp production;
RPC thiếu/429 sẽ hiển thị unavailable, không tự chuyển sang RPC khác.
Không cần chạy lại source/compiler rebuild hay các fork đã đạt.

Mở `http://127.0.0.1:3020/networks/base-sepolia/swap`. Chọn mạng ở góc trên phải.
Mỗi mạng có `/swap`, `/positions`, `/explore`, `/pools`, `/pool` dưới namespace
`/networks/base-sepolia` hoặc `/networks/unichain-sepolia`.
URL `/demo/1..4` và recovery Base cũ vẫn được giữ.

## 2. Chuẩn bị ví Unichain

- Chọn tài khoản **EOA**, chưa có delegation/smart account. Unichain chưa hỗ trợ
  profile smart account; nếu app báo EOA required thì dừng, không submit để thử.
- MetaMask: network **Unichain Sepolia**, chain ID **1301**, currency ETH.
  RPC public của mạng: `https://sepolia.unichain.org`.
- Lấy **test ETH và test USDC trên Unichain Sepolia**, cùng địa chỉ đang dùng.
  ETH ở Base hoặc Ethereum Sepolia không trả gas Unichain.
- Các faucet được liệt kê trong [tài liệu Uniswap](https://developers.uniswap.org/docs/unichain/tools/faucets):
  Superchain/QuickNode/thirdweb cho ETH, [Circle](https://faucet.circle.com/) cho USDC.
  Chọn Unichain Sepolia trên faucet. Có thể cần đăng nhập hoặc đáp ứng điều kiện
  provider; không cần gửi token thật vào DEX để nghiệm thu.

[Thông tin mạng chính thức](https://developers.uniswap.org/docs/unichain/technical-information/network-information).
USDC Unichain: `0x31d0220469e10c4E71834a79b1f276d740d3768F`.
WETH: `0x4200000000000000000000000000000000000006`.

## 3. Explore và chọn mạng

1. Mở Unichain `/explore`, nhấn **Refresh pool sample**.
2. Kiểm tra nhãn Unichain/1301, USDC–WETH, fee0.3%, source/block/observed.
3. Thử filter `USDC`, rồi một chuỗi không khớp; xem **Pool details**.
4. Mẫu quote1USDC là đọc dữ liệu; chưa cần kết nối ví.
5. Chọn Base và kiểm tra nhãn/địa chỉ thay đổi đúng. Base có liên kết tới danh
   sách bốn pool cũ; Unichain hiện chỉ có một pool được qualify.

Quote testnet không phải giá USD. TVL/volume/APR chưa có nguồn đáng tin cậy.

## 4. Swap hai chiều trên Unichain

1. `/networks/unichain-sepolia/swap` → Connect wallet → MetaMask.
2. USDC→WETH, bắt đầu **1 USDC**, slippage0.5%.
3. Get wallet quote → Review approval nếu cần. Approve **đúng input**;
   nếu allowance cũ khác0, reset0 rồi lấy quote/review mới.
4. Submit → Check original transaction → khi verified confirmed,
   **Acknowledge verified result**. Approval chưa phải swap.
5. Lấy quote mới → Review swap → ghi **Minimum received** của quote này →
   submit → check hash gốc → verified output≥minimum → acknowledge.
6. WETH→USDC với **0.0001 WETH** nếu đủ balance; thực hiện cùng quy trình.
   Giữ WETH còn lại để LP. Cap swap tối đa5USDC/0.001WETH.

Swap spender Unichain: `0xd1AAE39293221B77B0C71fBD6dCb7Ea29Bb5B166`.
Không dùng router Base `0x94cC…` trên Unichain.

## 5. Toàn bộ LP trên Unichain

Mở `/networks/unichain-sepolia/positions`. Connect → Use connected wallet →
Read LP positions; **No positions owned** hợp lệ trước mint.

Manager/spender LP: `0xB7F724d6dDDFd008eFf5cc2834edDE5F9eF0d075`.

| Thao tác | Kiểm tra |
|---|---|
| Create position | Chọn Full range trước; cap1USDC/0.001WETH hoặc cap nhỏ hơn nếu thiếu WETH. Planned deposit không vượt cap; approve từng token theo yêu cầu, rồi mint. Ghi NFT ID. |
| Add liquidity | Chọn NFT đó; cap nhỏ0.1USDC/0.0001WETH nếu đủ. NFT ID giữ nguyên, có actual deposit. |
| Remove50% | Liquidity còn lại; token vào owed của NFT, chưa chuyển về ví. |
| Remove100% | Liquidity về0; stored owed để collect. |
| Collect | Actual tokens collected chuyển về ví, stored owed về0; khoản collect gồm vốn rút và phí. |
| Close position | Chỉ khi liquidity/owed đều0; NFT không còn sở hữu sau refresh. |

Mỗi lần: **Study LP action → review → submit → check hash gốc → acknowledge →
Read LP positions lại**. Reset/approve là giao dịch riêng, cần study lại sau
acknowledge. Với custom range, chọn khoảng giá hợp lệ, kiểm tra ticks/giá được
làm tròn và NFT giữ đúng range; có thể làm một mint custom nhỏ rồi remove/collect/burn.

## 6. Recovery và hồi quy Base

- Sau khi có hash swap hoặc LP: reload; hash/network cũ phải giữ nguyên;
  check/acknowledge không mở prompt gửi mới. Network selector khóa khi chưa resolve.
- Reject một prompt chưa gửi: app báo rejected, không báo success.
- Đổi amount trước submit: quote/review cũ mất hiệu lực.
- Nếu `pending/confirming`: kiểm tra lại hash gốc. `unverified/reorged`:
  giữ record/hash và báo code, không gửi lại thử.
- Sau Unichain, quay Base: kiểm tra quote đúng chain84532 và đọc positions.
  Vòng Base swap/LP đã được bạn nghiệm thu trước; chỉ cần lặp giao dịch public
  nếu vòng kiểm tra giao diện mới này phát hiện bất thường.

Hai confirmations trong app là **canonical L2 inclusion**, không phải Ethereum
finality. Fee budget là ước tính; phí L1/operator thực thu vẫn chưa qualify.

## Gửi kết quả một lần

```text
Unichain Explore/filter/detail:
Unichain swap USDC→WETH: status + hash
Unichain swap WETH→USDC: status + hash
LP mint/full hoặc custom: status + NFT ID + hash
LP increase/decrease50/decrease100/collect/burn: status + từng hash
Reject/input change/reload/network lock:
Base quote/positions regression:
Desktop UI:
```

Không gửi API key, RPC credentials hay file recovery. Public-wallet nghiệm thu
Unichain chưa được thay thế bởi local fork/mock.
