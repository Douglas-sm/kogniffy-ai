import Image from "next/image";
import Link from "next/link";
import brandLogo from "../public/images/kogniffyai_logo.webp";
import styles from "./page.module.css";

function MountainKogArt() {
  return (
    <svg aria-hidden="true" viewBox="0 0 520 470" role="img">
      <path d="M52 421L194 120l84 126 54-86 140 261H52z" fill="#224b58" />
      <path d="M194 120l42 64-44 21-31-17 33-68z" fill="#fff9e9" />
      <path d="M332 160l41 76-38-13-25 18 22-81z" fill="#fff9e9" opacity="0.82" />
      <path d="M112 421c22-82 75-126 157-132 83-5 130 39 156 132H112z" fill="#173b4f" />
      <path d="M207 353c35-34 80-34 113 0v68H207v-68z" fill="#f6c55f" />
      <g className={styles.spark} fill="#6fd6c5">
        <circle cx="132" cy="237" r="9" />
        <circle cx="410" cy="253" r="7" />
        <circle cx="365" cy="117" r="6" />
      </g>
      <g className={styles.kogBody}>
        <g className={styles.propeller}>
          <ellipse cx="252" cy="65" rx="48" ry="8" fill="#dff7f3" />
          <ellipse cx="252" cy="65" rx="8" ry="48" fill="#dff7f3" />
        </g>
        <path d="M202 109c0-34 22-61 50-61s50 27 50 61-22 61-50 61-50-27-50-61z" fill="#fff9e9" stroke="#173b4f" strokeWidth="9" />
        <path d="M216 114c0-19 16-34 36-34s36 15 36 34-16 34-36 34-36-15-36-34z" fill="#173b4f" />
        <circle cx="252" cy="114" r="15" fill="#6fd6c5" />
        <circle cx="258" cy="108" r="5" fill="#fff" />
        <path d="M205 139l-31 24m125-24l31 24" stroke="#173b4f" strokeLinecap="round" strokeWidth="9" />
        <path d="M222 168l-12 27m72-27l12 27" stroke="#f06f59" strokeLinecap="round" strokeWidth="10" />
      </g>
    </svg>
  );
}

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.shell}>
        <section className={styles.content} aria-labelledby="home-title">

            <Image
              alt="Kogniffy AI"
              className={styles.logoImage}
              priority
              sizes="(max-width: 860px) 82vw, 520px"
              src={brandLogo}
            />
          <section className={styles.contentText}>
          <p className={styles.subtitle}>Plataforma gamificada de triagem cognitiva</p>
          <p className={styles.copy}>
            Muitas dificuldades podem passar despercebidas no cotidiano. Nesta aventura, a criança ajuda Kog a atravessar uma montanha enquanto o jogo observa padrões de interação, tempo de resposta, atenção e memória em mini-desafios simples.
          </p>
          <p className={styles.copy}>
            Ao final, o sistema apresenta sinais observados durante a experiência e recomendações em linguagem educativa. O resultado é apenas indicativo e pode apoiar uma conversa com um profissional especializado.
          </p>
          <div className={styles.notice}>
            Esta experiência possui caráter apenas educativo e indicativo.
            <br />
            Os resultados não representam diagnóstico clínico.
          </div>
          </section>
            <Link className={styles.playButton} href="/game" aria-label="Jogar Kogniffy AI">
                Jogar
                <span aria-hidden="true">→</span>
            </Link>
        </section>
        <div className={styles.scene}>
          <MountainKogArt />
        </div>
      </div>
    </main>
  );
}
