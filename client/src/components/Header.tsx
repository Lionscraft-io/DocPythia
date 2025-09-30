import { Link } from "wouter";
import { ThemeToggle } from "./ThemeToggle";
import { Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
          data-testid="button-menu-toggle"
        >
          <Menu className="h-5 w-5" />
        </Button>
        
        <Link href="/" className="flex items-center gap-2" data-testid="link-home">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <span className="text-lg font-bold text-primary-foreground">N</span>
          </div>
          <span className="hidden font-bold sm:inline-block text-lg">NEAR Nodes</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 flex-1">
          <Link href="/validator" className="text-sm font-medium hover-elevate px-3 py-2 rounded-md" data-testid="link-validator">
            Validator
          </Link>
          <Link href="/rpc" className="text-sm font-medium hover-elevate px-3 py-2 rounded-md" data-testid="link-rpc">
            RPC
          </Link>
          <Link href="/archival" className="text-sm font-medium hover-elevate px-3 py-2 rounded-md" data-testid="link-archival">
            Archival
          </Link>
          <Link href="/admin" className="text-sm font-medium text-muted-foreground hover-elevate px-3 py-2 rounded-md" data-testid="link-admin">
            Admin
          </Link>
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2">
          <div className="relative hidden sm:block max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search documentation..."
              className="pl-9"
              data-testid="input-search"
            />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
