import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowRight,
  ArrowUpRight,
  Monitor,
  Check,
  ChevronDown,
  Clock3,
  Folder,
  GitPullRequest,
  MessageSquare,
  MoreHorizontal,
  Play,
  Plus,
  Settings2,
  Terminal,
} from 'lucide-react';
import { DesktopDownload, MarketingHeader, MarketingFooter } from '../components/desktop-download';
import { HeroArtwork } from '../components/hero-artwork';
import '../landing.css';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'OpenFactory — Your agents, on your computers' },
      {
        name: 'description',
        content:
          'A workspace for coding agents on your own computers. Bring Codex or Claude Code, schedule recurring work, and follow every run in one place.',
      },
    ],
  }),
  component: Landing,
});

function WorkspacePreview() {
  return (
    <figure className="landing-preview">
      <div className="landing-window">
        <div className="landing-window-bar">
          <span className="landing-window-dots">
            <i />
            <i />
            <i />
          </span>
          <span>OpenFactory</span>
          <span>Example workspace</span>
        </div>
        <div className="landing-workspace">
          <aside className="landing-preview-sidebar">
            <div className="landing-preview-brand">
              <img src="/openfactory.png" width={25} height={25} alt="" /> OpenFactory
            </div>
            <div className="landing-preview-computer">
              <Monitor size={14} /> My Mac <ChevronDown size={13} />
            </div>
            <div className="landing-sidebar-label">
              Factories <Plus size={12} />
            </div>
            <div className="landing-preview-project">
              <Folder size={14} /> Acme website
            </div>
            <div className="landing-preview-subnav">Overview</div>
            <div className="landing-preview-subnav is-selected">
              Agents <span>3</span>
            </div>
            <div className="landing-preview-subnav">Runs</div>
            <div className="landing-preview-subnav">Pull requests</div>
            <div className="landing-sidebar-settings">
              <Settings2 size={14} /> Settings
            </div>
          </aside>
          <div className="landing-preview-main">
            <div className="landing-preview-breadcrumb">
              Acme website <span>/</span> Agents
            </div>
            <div className="landing-preview-title">
              <div>
                <h2>Your team, ready to work.</h2>
                <p>Recurring work. A little less on your plate.</p>
              </div>
              <span className="landing-mini-button">
                <Plus size={13} /> Create agent
              </span>
            </div>
            <div className="landing-agent-list">
              {[
                {
                  name: 'Code reviewer',
                  task: 'A second set of eyes on every change.',
                  schedule: 'Every 30 minutes',
                  provider: 'Codex',
                  state: 'Scheduled',
                },
                {
                  name: 'Daily digest',
                  task: 'The project update you actually read.',
                  schedule: 'Weekdays at 9:00',
                  provider: 'Claude Code',
                  state: 'Scheduled',
                },
                {
                  name: 'Dependency check',
                  task: 'Keep an eye on what needs updating.',
                  schedule: 'Mondays at 8:00',
                  provider: 'Codex',
                  state: 'Paused',
                },
              ].map((agent) => (
                <div className="landing-agent-row" key={agent.name}>
                  <span className="landing-agent-symbol">
                    <Terminal size={18} />
                  </span>
                  <div>
                    <strong>{agent.name}</strong>
                    <p>{agent.task}</p>
                  </div>
                  <div className="landing-agent-schedule">
                    <span>
                      <Clock3 size={12} />
                      {agent.schedule}
                    </span>
                    <small>{agent.provider}</small>
                  </div>
                  <span
                    className={`landing-agent-state ${agent.state === 'Paused' ? 'is-paused' : ''}`}
                  >
                    {agent.state}
                  </span>
                  <MoreHorizontal size={16} />
                </div>
              ))}
            </div>
            <div className="landing-preview-activity">
              <span>Latest activity</span>
              <span>
                View runs <ArrowUpRight size={12} />
              </span>
            </div>
            <div className="landing-run-example">
              <span className="landing-success">
                <Check size={14} />
              </span>
              <div>
                <strong>Daily digest</strong>
                <p>Project summary is ready to read.</p>
              </div>
              <span>9:02 AM</span>
              <ArrowUpRight size={15} />
            </div>
          </div>
        </div>
      </div>
      <figcaption>
        An example factory. Your projects, agents, and runs share one workspace.
      </figcaption>
    </figure>
  );
}

function Features() {
  return (
    <section className="landing-features" id="features" aria-labelledby="features-title">
      <div className="landing-feature-intro">
        <h2 id="features-title">
          Less tending to agents.
          <br />
          <span>More getting things done.</span>
        </h2>
        <p>A terminal is a great place to start. A factory gives the work somewhere to live.</p>
      </div>
      <article className="landing-feature-row">
        <div className="landing-feature-copy">
          <h3>
            Bring your agents.
            <br />
            Keep your setup.
          </h3>
          <p>
            OpenFactory starts Codex CLI and Claude Code CLI directly on your computer. Use the
            tools and credentials you already have, with a workspace around the work.
          </p>
          <ul>
            <li>
              <Check size={16} />
              Choose a provider for each agent
            </li>
            <li>
              <Check size={16} />
              Keep execution on your own machine
            </li>
            <li>
              <Check size={16} />
              Group agents by project
            </li>
          </ul>
          <Link
            to="/docs/$"
            params={{ _splat: 'how-factories-work' }}
            className="landing-text-link"
          >
            How factories work <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="landing-provider-panel">
          <div className="landing-provider">
            <span className="landing-provider-mark">
              <img src="/brands/openai.svg" width={27} height={27} alt="" />
            </span>
            <div>
              <strong>Codex CLI</strong>
              <span>Your computer. Your credentials.</span>
            </div>
            <Check size={17} />
          </div>
          <div className="landing-provider">
            <span className="landing-provider-mark claude-mark">
              <img src="/brands/claude.svg" width={29} height={29} alt="" />
            </span>
            <div>
              <strong>Claude Code</strong>
              <span>Your computer. Your credentials.</span>
            </div>
            <Check size={17} />
          </div>
          <p>Install and sign in to your agent CLI on each computer that runs work.</p>
        </div>
      </article>
      <article className="landing-feature-row landing-feature-reverse">
        <div className="landing-feature-copy">
          <h3>
            Give repeat work
            <br />a regular time.
          </h3>
          <p>
            Code reviews, dependency checks, daily digests. Give an agent its instructions and a
            schedule, then return to its runs when you’re ready.
          </p>
          <ul>
            <li>
              <Clock3 size={16} />
              Run on a timer or trigger with a webhook
            </li>
            <li>
              <Play size={16} />
              Start a run whenever you need one
            </li>
            <li>
              <MessageSquare size={16} />
              Read the output and continue the conversation
            </li>
          </ul>
          <p className="landing-feature-note">
            Scheduled work needs the execution computer to stay on and the host to keep running.
          </p>
        </div>
        <div className="landing-schedule-panel">
          <div className="landing-panel-heading">
            <span>
              <Clock3 size={17} /> Daily digest
            </span>
            <span className="landing-status">Scheduled</span>
          </div>
          <div className="landing-schedule-time">
            09:00<span>Every weekday</span>
          </div>
          <div className="landing-week">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => (
              <span className={index < 5 ? 'is-active' : ''} key={day}>
                {day.slice(0, 1)}
              </span>
            ))}
          </div>
          <div className="landing-schedule-result">
            <Check size={15} />
            <span>Previous run completed</span>
            <span>Today, 9:02</span>
          </div>
        </div>
      </article>
      <article className="landing-feature-row">
        <div className="landing-feature-copy">
          <h3>
            Your desk. Your laptop.
            <br />
            The same place to look.
          </h3>
          <p>
            Pair your computers over Tailscale and switch between them in Settings. Each computer
            keeps its own folders, agents, and runs. OpenFactory brings them within reach.
          </p>
          <ul>
            <li>
              <Monitor size={16} />
              Choose which computer you’re working with
            </li>
            <li>
              <Folder size={16} />
              Keep project context with its agents
            </li>
            <li>
              <GitPullRequest size={16} />
              Follow runs and repository activity together
            </li>
          </ul>
          <Link to="/docs/$" params={{ _splat: 'quickstart' }} className="landing-text-link">
            Get your workspace ready <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="landing-computers-panel">
          <div className="landing-panel-heading">
            <span>Computers</span>
            <Settings2 size={16} />
          </div>
          <div className="landing-computer-row">
            <Monitor size={22} />
            <div>
              <strong>My Mac</strong>
              <span>This computer</span>
            </div>
            <span className="landing-status">Selected</span>
          </div>
          <div className="landing-computer-row">
            <Terminal size={22} />
            <div>
              <strong>Office workstation</strong>
              <span>Paired over Tailscale</span>
            </div>
            <span className="landing-paired">Paired</span>
          </div>
          <p>Example connections · Manage your devices in Settings</p>
        </div>
      </article>
    </section>
  );
}

function GettingStarted() {
  return (
    <section className="landing-get-started" aria-labelledby="start-title">
      <h2 id="start-title">
        A little setup.
        <br />A lot of work off your mind.
      </h2>
      <ol>
        <li>
          <h3>Make yourself at home.</h3>
          <p>
            Install OpenFactory and sign in to Codex CLI or Claude Code on the computer that will
            run your agents.
          </p>
        </li>
        <li>
          <h3>Give an agent a job.</h3>
          <p>Choose a project folder, write the instructions, and decide when it should run.</p>
        </li>
        <li>
          <h3>Come back to the work.</h3>
          <p>Follow runs, read the output, and continue the conversation from your workspace.</p>
        </li>
      </ol>
      <Link to="/docs/$" params={{ _splat: 'quickstart' }} className="landing-text-link">
        Read the quickstart <ArrowRight size={16} />
      </Link>
    </section>
  );
}

function Questions() {
  return (
    <section className="landing-faq" aria-labelledby="faq-title">
      <h2 id="faq-title">Before you clock in.</h2>
      <div>
        {[
          [
            'Do I need T3 Code?',
            'No. OpenFactory owns its runtime and starts Codex CLI or Claude Code CLI directly. Install and authenticate the provider you want to use on each execution computer.',
          ],
          [
            'Does my computer need to stay on?',
            'Yes. The computer running an agent needs to be awake and its OpenFactory host needs to be running for scheduled work to start. On Mac, you can enable Start host at login in Settings.',
          ],
          [
            'Can I use more than one computer?',
            'Yes. Install OpenFactory and Tailscale on both computers, connect them to the same tailnet, and pair them in Settings. Then choose the computer you want to work with.',
          ],
          [
            'Is the desktop app ready for everyday use?',
            'The desktop app is a preview. Mac builds are unsigned and may require approval in System Settings → Privacy & Security. Start with a project you’re comfortable experimenting with.',
          ],
        ].map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <Plus size={18} />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Downloads() {
  return (
    <section
      className="landing-downloads landing-download-close"
      id="download"
      aria-labelledby="download-title"
    >
      <div className="landing-section-heading">
        <h2 id="download-title">Put your factory to work.</h2>
        <p>Pick a computer. Bring your agents. Make it yours.</p>
      </div>
      <DesktopDownload showPlatforms />
      <p className="landing-close-note">
        Desktop preview. Your agent CLI runs on your own computer.
      </p>
    </section>
  );
}

function Landing() {
  return (
    <div className="landing">
      <MarketingHeader />
      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <HeroArtwork />
          <h1 id="landing-title">
            <span className="hero-line">Your agents.</span>
            <span className="hero-line">Your computers.</span>
            <span className="hero-line hero-line-accent">One factory.</span>
          </h1>
          <p>
            Run Codex and Claude Code on your own computers. Schedule the work, connect your
            machines, and keep every project and conversation in one place.
          </p>
          <DesktopDownload showPlatforms />
          <Link className="landing-browser" to="/docs/$" params={{ _splat: 'quickstart' }}>
            Set up your workspace <ArrowUpRight size={14} />
          </Link>
        </section>
        <WorkspacePreview />
        <Features />
        <GettingStarted />
        <Questions />
        <Downloads />
      </main>
      <MarketingFooter />
    </div>
  );
}
