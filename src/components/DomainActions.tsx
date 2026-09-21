import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { blockDomain, copyBlockRule, isDomainBlocked, openUBlockDashboard, unblockDomain, uBlockFilter } from "@/src/extension/block";
import { isDomainIgnored, setDomainIgnored } from "@/src/storage/settings";

export function DomainActions({
  domain,
  followed,
  onFollow,
}: {
  domain: string;
  followed?: boolean;
  onFollow?: () => void;
}) {
  const [blockNote, setBlockNote] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [ignored, setIgnored] = useState(false);

  useEffect(() => {
    void isDomainBlocked(domain).then(setBlocked);
    void isDomainIgnored(domain).then(setIgnored);
  }, [domain]);

  const block = async (): Promise<void> => {
    const result = await blockDomain(domain);
    setBlockNote(
      result === "blocked"
        ? "Blocked in this browser for that domain only. Chrome asks for host access before the block can take effect."
        : `Copied ${uBlockFilter(domain)} — paste it into uBlock if the block prompt was declined.`,
    );
    if (result === "blocked") setBlocked(true);
  };

  const allow = async (): Promise<void> => {
    await unblockDomain(domain);
    setBlocked(false);
    setBlockNote("Allowed again. Reload the site to restore its requests.");
  };

  const ignore = async (): Promise<void> => {
    const next = !ignored;
    await setDomainIgnored(domain, next);
    setIgnored(next);
    setBlockNote(next ? "Future change alerts will ignore this domain." : "This domain can appear in alerts again.");
  };

  const ublock = async (): Promise<void> => {
    await copyBlockRule(domain);
    const opened = await openUBlockDashboard();
    setBlockNote(
      opened
        ? `Copied ${uBlockFilter(domain)} and opened uBlock.`
        : `Copied ${uBlockFilter(domain)}. Install uBlock Origin to paste it there.`,
    );
  };

  return (
    <div className="space-y-1.5">
      {onFollow ? (
        <Button variant={followed ? "subtle" : "ghost"} size="sm" className="w-full" onClick={onFollow}>
          {followed ? "Watching this domain" : "Watch this domain"}
        </Button>
      ) : null}
      {followed ? (
        <p className="text-[12px] text-mute">You’ll get a notification if it shows up on another site you check.</p>
      ) : null}
      <Button variant="ghost" size="sm" className="w-full" onClick={() => void (blocked ? allow() : block())}>
        {blocked ? "Allow this domain" : "Block this domain"}
      </Button>
      <Button variant="ghost" size="sm" className="w-full" onClick={() => void ignore()}>
        {ignored ? "Include in alerts" : "Ignore future alerts"}
      </Button>
      <Button variant="ghost" size="sm" className="w-full" onClick={() => void ublock()}>
        Copy uBlock filter
      </Button>
      {blockNote ? <p className="text-[12px] text-mute">{blockNote}</p> : null}
    </div>
  );
}
