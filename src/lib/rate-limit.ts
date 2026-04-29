import { Redis } from "@upstash/redis";

function getRedis() {
  return Redis.fromEnv();
}

function getUtcDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10).replaceAll("-", "");
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || null;
  if (realIp) return realIp.trim() || null;

  return null;
}

export async function checkDailyIpLimit(ip: string) {
  const key = `rate-limit:design-request:${ip}:${getUtcDayKey()}`;
  const redis = getRedis();
  const count = await redis.incr(key);

  if (count === 1) {
    const tomorrowUtc = new Date();
    tomorrowUtc.setUTCHours(24, 0, 0, 0);
    const secondsUntilTomorrow = Math.max(1, Math.ceil((tomorrowUtc.getTime() - Date.now()) / 1000));
    await redis.expire(key, secondsUntilTomorrow);
  }

  return {
    allowed: count <= 1,
    remaining: Math.max(0, 1 - count),
  };
}
