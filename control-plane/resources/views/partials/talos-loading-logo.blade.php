<div class="talos-loading-screen">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" class="talos-spinner">
    <style>
      /* Stili base e contenitore */
      .talos-loading-screen {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100vw;
        height: 100vh;
        background-color: #0A0C10; /* Sfondo dark di TALOS */
      }
      
      .talos-spinner {
        width: 120px;
        height: 120px;
      }

      /* Colori e spessori base */
      .hex-border {
        stroke: #F5A623;
        stroke-opacity: 0.15; /* Esagono sempre visibile ma in penombra */
      }
      
      .edge {
        stroke: #F5A623;
        fill: none;
        stroke-width: 9;
        /* Imposta la lunghezza virtuale del tratto a 80px (superiore alla linea più lunga di 63px) */
        stroke-dasharray: 80; 
        stroke-dashoffset: 80; 
      }

      .node {
        stroke: #F5A623;
        fill: #0A0C10;
        stroke-width: 9;
        transition: all 0.3s ease;
      }

      /* Coreografia delle Animazioni (Durata loop: 2.5s) */
      .node-root { animation: igniteNode 2.5s infinite; }
      .edge-main { animation: flowData 2.5s infinite; animation-delay: 0.2s; }
      
      .node-mid  { animation: igniteNode 2.5s infinite; animation-delay: 0.5s; }
      .edge-branch { animation: flowData 2.5s infinite; animation-delay: 0.7s; }
      
      .node-out  { animation: igniteNode 2.5s infinite; animation-delay: 1.0s; }

      /* Keyframe: Disegna la linea in entrata e la cancella in uscita */
      @keyframes flowData {
        0%, 15% { stroke-dashoffset: 80; opacity: 0; }
        35%, 65% { stroke-dashoffset: 0; opacity: 1; }
        85%, 100% { stroke-dashoffset: -80; opacity: 0; }
      }

      /* Keyframe: Accende il nodo (riempimento solido e bagliore) quando arriva la linea */
      @keyframes igniteNode {
        0%, 15% { fill: #0A0C10; stroke-width: 9; filter: drop-shadow(0 0 0 transparent); }
        35%, 65% { fill: #F5A623; stroke-width: 0; filter: drop-shadow(0 0 12px rgba(245, 166, 35, 0.8)); }
        85%, 100% { fill: #0A0C10; stroke-width: 9; filter: drop-shadow(0 0 0 transparent); }
      }
    </style>
    
    <g stroke-linecap="round" stroke-linejoin="round">
      
      <path class="hex-border" stroke-width="12" fill="none" d="
        M 218 123.5 
        L 121.9 179 A 21 21 0 0 0 111.5 197 
        L 111.5 333 A 21 21 0 0 0 121.9 351 
        L 239.6 419 A 21 21 0 0 0 260.4 419 
        L 378.1 351 A 21 21 0 0 0 388.5 333 
        L 388.5 197 A 21 21 0 0 0 378.1 179 
        L 282 123.5
      " />

      <g>
        <circle class="node node-root" cx="250" cy="105" r="22" />
        <path class="edge edge-main" d="M 250 140 L 250 195" />
        
        <circle class="node node-mid" cx="250" cy="225" r="18" />
        
        <path class="edge edge-branch" d="M 250 255 L 250 315" />
        <circle class="node node-out" cx="250" cy="338" r="14" />

        <g transform="translate(250, 225) rotate(45)">
          <path class="edge edge-branch" d="M 0 32 L 0 95" />
          <circle class="node node-out" cx="0" cy="118" r="14" />
        </g>

        <g transform="translate(250, 225) rotate(-45)">
          <path class="edge edge-branch" d="M 0 32 L 0 95" />
          <circle class="node node-out" cx="0" cy="118" r="14" />
        </g>
      </g>
      
    </g>
  </svg>
</div>
