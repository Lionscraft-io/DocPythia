import { Link } from "wouter";
import { Header } from "@/components/Header";
import { NodeTypeCard } from "@/components/NodeTypeCard";
import { Server, Database, Archive, Bot, GitBranch, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ProtocolView() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <section className="relative py-20 md:py-32">
          <div className="container">
            <div className="mx-auto max-w-3xl text-center space-y-6">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl" data-testid="heading-hero">
                NEAR Nodes
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed" data-testid="text-hero-subtitle">
                Comprehensive, AI-powered documentation for running NEAR Protocol nodes.
                Automatically updated with the latest community insights.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                <Link href="/protocolview/validator">
                  <Button size="lg" data-testid="button-get-started">
                    Get Started
                  </Button>
                </Link>
                <a href="https://github.com/near/nearcore/releases" target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="outline" data-testid="button-github">
                    View on GitHub
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 bg-muted/30">
          <div className="container">
            <div className="mx-auto max-w-5xl">
              <h2 className="text-3xl font-bold text-center mb-12" data-testid="heading-node-types">
                Node Types
              </h2>
              <div className="grid gap-6 md:grid-cols-3">
                <NodeTypeCard
                  title="Validator Node"
                  description="Participate in consensus and produce blocks and/or chunks on the NEAR network."
                  icon={Server}
                  href="/protocolview/validator"
                />
                <NodeTypeCard
                  title="RPC Node"
                  description="Service providers that provide public RPC endpoints for developers to use."
                  icon={Database}
                  href="/protocolview/rpc"
                />
                <NodeTypeCard
                  title="Archival Node"
                  description="Store full blockchain data and build an archive of historical states."
                  icon={Archive}
                  href="/protocolview/archival"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container">
            <div className="mx-auto max-w-5xl">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold mb-4" data-testid="heading-ai-powered">
                  AI-Powered Updates
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Our documentation stays current by monitoring community channels and
                  automatically incorporating relevant updates.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Bot className="h-6 w-6" />
                      </div>
                      <h3 className="font-semibold">Smart Monitoring</h3>
                      <p className="text-sm text-muted-foreground">
                        AI agents continuously scan community channels for relevant validator information.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-chart-2/10 text-chart-2">
                        <GitBranch className="h-6 w-6" />
                      </div>
                      <h3 className="font-semibold">Quality Control</h3>
                      <p className="text-sm text-muted-foreground">
                        Minor updates applied automatically, major changes reviewed by maintainers.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-chart-3/10 text-chart-3">
                        <Clock className="h-6 w-6" />
                      </div>
                      <h3 className="font-semibold">Always Current</h3>
                      <p className="text-sm text-muted-foreground">
                        Documentation reflects the latest community knowledge and best practices.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 bg-card">
          <div className="container">
            <div className="mx-auto max-w-3xl text-center space-y-6">
              <h2 className="text-3xl font-bold" data-testid="heading-cta">
                Ready to run a NEAR node?
              </h2>
              <p className="text-lg text-muted-foreground">
                Choose your node type and follow our comprehensive guides to get started.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                <Link href="/protocolview/validator">
                  <Button size="lg" data-testid="button-cta-validator">
                    Start with Validator
                  </Button>
                </Link>
                <Link href="/admin">
                  <Button size="lg" variant="outline" data-testid="button-cta-admin">
                    Admin Dashboard
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 mt-auto">
        <div className="container">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <p className="text-sm text-muted-foreground">
              © 2025 NEAR Nodes. Documentation powered by AI.
            </p>
            <div className="flex gap-6">
              <a href="https://near.org" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground" data-testid="link-near">
                NEAR Protocol
              </a>
              <a href="https://near.zulipchat.com" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground" data-testid="link-zulipchat">
                Community
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
