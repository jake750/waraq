import { AlertCircle, ArrowRight, Check, ExternalLink, FileText, FolderOpen, Image as ImageIcon, Layers, Plus, RotateCcw, Share2, X } from "lucide-react";
import { useT } from "../i18n";
import { isAndroid } from "../platform";
import { pickFiles } from "../files/docRef";
import { targetsFor, type Target } from "./formats";
import { MIME } from "./run";
import { officeCancel, openOutput, pickFolder, revealOutput, shareOutput } from "./native";
import type { Job } from "./queue";
import type { ConvertApi } from "./useConvert";
import OfficePromptDialog from "./OfficePrompt";
import "./convert.css";

const LABEL: Record<Target, string> = { pdf: "PDF", docx: "DOCX", txt: "TXT", md: "Markdown", html: "HTML", png: "PNG", jpg: "JPG" };
const ALL_TARGETS: Target[] = ["pdf", "docx", "txt", "md", "html", "png", "jpg"];
const IMAGE = ["png", "jpg", "webp"];

type Props = { api: ConvertApi; dragOver: boolean; onToast(msg: string): void };

export default function ConvertScreen({ api, dragOver, onToast }: Props) {
  const t = useT();
  const android = isAndroid();
  const platform = android ? "android" : "desktop";
  const { queue } = api;
  const waiting = queue.jobs.filter((j) => j.state === "queued");
  const busy = queue.running || queue.jobs.some((j) => j.state === "running");
  const waitingImages = waiting.filter((j) => IMAGE.includes(j.fmt) && j.inputs.length === 1).length;
  const allTargets = ALL_TARGETS.filter((tg) => waiting.some((j) => targetsFor(j.fmt, platform).includes(tg)));
  const finished = queue.jobs.some((j) => j.state === "done" || j.state === "error" || j.state === "cancelled");

  const addFiles = async () => {
    const refs = await pickFiles(true).catch(() => []);
    if (!refs.length) return;
    const skipped = await api.add(refs);
    if (skipped) onToast(t.skippedFiles(skipped));
  };

  const chooseFolder = async () => {
    const dir = await pickFolder().catch(() => null);
    if (dir) api.setSaveMode({ kind: "folder", dir });
  };

  return (
    <div className="convert">
      <div className="convert-inner">
        <header className="convert-head">
          <div>
            <h1>{t.convertTitle}</h1>
            <p>{t.convertSub}</p>
          </div>
          {queue.jobs.length > 0 && (
            <button className="btn btn-ghost" onClick={addFiles}>
              <Plus size={18} />
              {t.addFiles}
            </button>
          )}
        </header>

        {queue.jobs.length === 0 ? (
          <section className={`dropzone${dragOver ? " over" : ""}`}>
            <div className="dropzone-icon">
              <Layers size={26} />
            </div>
            <h1>{dragOver ? t.dropHere : t.convertEmpty}</h1>
            <p>DOCX · DOC · ODT · RTF · TXT · MD · HTML · EPUB · PDF · PNG · JPG · WEBP</p>
            <button className="btn btn-primary" onClick={addFiles}>
              {t.addFiles}
            </button>
          </section>
        ) : (
          <>
            <div className="convert-bar">
              {allTargets.length > 0 && (
                <label className="convert-select">
                  <span>{t.convertAllTo}</span>
                  <select value="" onChange={(e) => e.target.value && api.setAll(e.target.value as Target)}>
                    <option value="">—</option>
                    {allTargets.map((tg) => (
                      <option key={tg} value={tg}>
                        {LABEL[tg]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {waitingImages >= 2 && (
                <button className="btn btn-ghost" onClick={() => api.dispatch({ type: "combineImages" })}>
                  <ImageIcon size={17} />
                  {t.combineImages}
                </button>
              )}
              {android ? (
                <span className="convert-note">{t.savedToDownloads}</span>
              ) : (
                <label className="convert-select">
                  <span>{t.saveTo}</span>
                  <select
                    value={api.saveMode.kind === "folder" ? "folder" : "beside"}
                    onChange={(e) => (e.target.value === "beside" ? api.setSaveMode({ kind: "beside" }) : chooseFolder())}
                  >
                    <option value="beside">{t.saveBeside}</option>
                    <option value="folder">{api.saveMode.kind === "folder" ? api.saveMode.dir : t.saveFolder}</option>
                  </select>
                </label>
              )}
            </div>

            <ul className="job-list">
              {queue.jobs.map((j) => (
                <JobRow key={j.id} job={j} api={api} platform={platform} onToast={onToast} />
              ))}
            </ul>

            <div className="convert-actions">
              {finished && (
                <button className="btn btn-ghost" onClick={() => api.dispatch({ type: "clearFinished" })}>
                  {t.clearFinished}
                </button>
              )}
              {busy ? (
                <button className="btn btn-ghost danger" onClick={api.stopAll}>
                  {t.stop}
                </button>
              ) : (
                <button className="btn btn-primary" disabled={waiting.length === 0} onClick={api.start}>
                  {t.startConvert}
                  {waiting.length > 1 ? ` (${waiting.length})` : ""}
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {api.prompt && (
        <OfficePromptDialog
          prompt={api.prompt}
          sizeMb={Math.round((api.office?.downloadBytes ?? 0) / 1e6)}
          onDownload={api.downloadOffice}
          onBuiltIn={api.chooseBuiltIn}
          onCancel={api.closePrompt}
          onStop={officeCancel}
        />
      )}
    </div>
  );
}

function JobRow({ job, api, platform, onToast }: { job: Job; api: ConvertApi; platform: "desktop" | "android"; onToast(m: string): void }) {
  const t = useT();
  const targets = targetsFor(job.fmt, platform);
  const isImage = IMAGE.includes(job.fmt);
  const fail = (e: unknown) => onToast(String(e));
  const status =
    job.state === "queued"
      ? t.jobQueued
      : job.state === "running"
        ? t.jobRunning
        : job.state === "done"
          ? job.output?.count && job.output.count > 1
            ? `${t.jobDone} · ${t.filesCount(job.output.count)}`
            : t.jobDone
          : job.state === "cancelled"
            ? t.jobCancelled
            : t.convertErrors[job.error ?? "engine-failed"];
  return (
    <li className={`job job-${job.state}`}>
      <span className="job-icon" aria-hidden>
        {job.state === "done" ? <Check size={18} /> : job.state === "error" ? <AlertCircle size={18} /> : isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
      </span>
      <span className="job-text">
        <span className="job-name" title={job.name}>
          {job.inputs.length > 1 ? `${job.name} + ${job.inputs.length - 1}` : job.name}
        </span>
        <span className="job-meta" role={job.state === "error" ? "alert" : undefined}>
          {job.inputs.length > 1 && <>{t.imagesCount(job.inputs.length)} · </>}
          {status}
        </span>
        {job.state === "running" && (
          <span className="job-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress * 100)}>
            <span style={{ inlineSize: `${Math.max(4, job.progress * 100)}%` }} />
          </span>
        )}
      </span>
      <span className="job-fmt">
        <span className="job-from">{job.fmt.toUpperCase()}</span>
        <ArrowRight size={14} className="job-arrow" aria-hidden />
        {job.state === "queued" && targets.length > 1 && job.inputs.length === 1 ? (
          <select
            aria-label={t.convertTo}
            value={job.target}
            onChange={(e) => api.dispatch({ type: "setTarget", id: job.id, target: e.target.value as Target })}
          >
            {targets.map((tg) => (
              <option key={tg} value={tg}>
                {LABEL[tg]}
              </option>
            ))}
          </select>
        ) : (
          <span className="job-to">{LABEL[job.target]}</span>
        )}
      </span>
      <span className="job-actions">
        {job.state === "done" && job.output && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => openOutput(job.output!, MIME[job.target]).catch(fail)}>
              <ExternalLink size={16} />
              {t.openFile}
            </button>
            {platform === "desktop" ? (
              <button className="icon-btn" title={t.showInFolder} aria-label={t.showInFolder} onClick={() => revealOutput(job.output!).catch(fail)}>
                <FolderOpen size={17} />
              </button>
            ) : (
              <button className="icon-btn" title={t.share} aria-label={t.share} onClick={() => shareOutput(job.output!, MIME[job.target]).catch(fail)}>
                <Share2 size={17} />
              </button>
            )}
          </>
        )}
        {(job.state === "error" || job.state === "cancelled") && (
          <button className="icon-btn" title={t.retry} aria-label={t.retry} onClick={() => api.dispatch({ type: "retry", id: job.id })}>
            <RotateCcw size={17} />
          </button>
        )}
        {job.state === "running" || job.state === "queued" ? (
          <button className="icon-btn" title={t.cancelJob} aria-label={t.cancelJob} onClick={() => (job.state === "running" ? api.cancel(job.id) : api.dispatch({ type: "remove", id: job.id }))}>
            <X size={17} />
          </button>
        ) : (
          <button className="icon-btn" title={t.remove} aria-label={t.remove} onClick={() => api.dispatch({ type: "remove", id: job.id })}>
            <X size={17} />
          </button>
        )}
      </span>
    </li>
  );
}
