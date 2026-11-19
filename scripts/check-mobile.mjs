import { networkInterfaces } from "node:os";
import { createConnection } from "node:net";

function canReach(address, port, timeout = 2500) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: address, port });
    const finish = (reachable) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

const addresses = [];
for (const [interfaceName, entries] of Object.entries(networkInterfaces())) {
  for (const entry of entries ?? []) {
    if (entry.family !== "IPv4" || entry.internal) continue;
    if (entry.address.startsWith("192.168.") && interfaceName.toLowerCase().includes("vm")) {
      continue;
    }
    addresses.push({ interfaceName, address: entry.address });
  }
}

if (addresses.length === 0) {
  console.error("没有找到可供手机访问的局域网 IPv4 地址。");
  process.exitCode = 1;
} else {
  for (const { interfaceName, address } of addresses) {
    const url = `http://${address}:5173/`;
    const reachable = await canReach(address, 5173);
    console.log(
      `${interfaceName}\t${url}\t${reachable ? "端口监听正常" : "端口不可达"}`
    );
  }
}

console.log("\n手机操作：");
console.log("1. 手机和电脑连接同一个允许设备互访的 Wi-Fi。");
console.log("2. 关闭手机蜂窝数据后，在浏览器打开上表中标为“可用”的地址。");
console.log("3. 不要使用 localhost、127.0.0.1 或 VMware 地址。");
console.log("4. 校园网若启用设备隔离，局域网地址仍不可达，需要部署到 Cloudflare。");
