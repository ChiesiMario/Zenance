import { cn } from '@/lib/utils';
import { User, Building2 } from 'lucide-react';

export interface ContactAvatarProps {
  group?: string;
  className?: string;
  iconClassName?: string;
  title?: string;
}

export function ContactAvatar({
  group,
  className,
  iconClassName,
  title,
}: ContactAvatarProps) {
  const isOrg = group === 'organization';
  const Icon = isOrg ? Building2 : User;

  return (
    <div
      className={cn(
        "rounded-full bg-muted/50 border border-border flex items-center justify-center text-foreground shrink-0 select-none shadow-none",
        className
      )}
      title={title}
    >
      <Icon className={cn("w-4 h-4 text-muted-foreground shrink-0", iconClassName)} />
    </div>
  );
}
