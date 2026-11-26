"""Pre-crafted educational visualization templates for scientific and medical topics.

Used when visual explanations are requested or synthesized dynamically.
All scripts strictly adhere to the AST security sandbox rules (no os/sys/open/dunders).
"""

from __future__ import annotations
from typing import Any


def get_template_for_query(query: str) -> dict[str, Any] | None:
    """Return an educational visualization specification matching the query domain."""
    q = query.lower()

    if any(k in q for k in ("heart", "cardiac", "circulation", "ventricle", "atrium", "aorta")):
        return {
            "type": "anatomy",
            "title": "Human Heart & Circulatory Flow Diagram",
            "description": "Educational schematic showing the 4 heart chambers, major vessels, and oxygenated (red) vs deoxygenated (blue) blood flow pathways.",
            "renderer": "matplotlib",
            "output_format": "png",
            "script": """import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches

fig, ax = plt.subplots(figsize=(9, 7), dpi=200)
ax.set_facecolor('#f8fafc')
fig.patch.set_facecolor('#ffffff')

# Title & Subtitle
plt.title("Human Heart Anatomy & Blood Circulation Pathways", fontsize=16, fontweight='bold', pad=20, color='#1e293b')
ax.text(0.5, 0.95, "Educational Schematic: Blue = Deoxygenated Blood | Red = Oxygenated Blood",
        ha='center', va='center', transform=ax.transAxes, fontsize=10, color='#64748b', style='italic')

# Heart Chambers (Schematic representation)
# Right Atrium (Blueish)
ra = patches.FancyBboxPatch((0.15, 0.52), 0.3, 0.3, boxstyle="round,pad=0.04", fc='#dbeafe', ec='#2563eb', lw=2.5)
ax.add_patch(ra)
ax.text(0.30, 0.67, "RIGHT ATRIUM\\n(Deoxygenated Inflow)", ha='center', va='center', fontsize=10, fontweight='bold', color='#1e40af')

# Right Ventricle (Blue)
rv = patches.FancyBboxPatch((0.15, 0.15), 0.3, 0.3, boxstyle="round,pad=0.04", fc='#bfdbfe', ec='#1d4ed8', lw=2.5)
ax.add_patch(rv)
ax.text(0.30, 0.30, "RIGHT VENTRICLE\\n(Pumps to Lungs)", ha='center', va='center', fontsize=10, fontweight='bold', color='#1e3a8a')

# Left Atrium (Reddish)
la = patches.FancyBboxPatch((0.55, 0.52), 0.3, 0.3, boxstyle="round,pad=0.04", fc='#fee2e2', ec='#dc2626', lw=2.5)
ax.add_patch(la)
ax.text(0.70, 0.67, "LEFT ATRIUM\\n(Oxygenated from Lungs)", ha='center', va='center', fontsize=10, fontweight='bold', color='#991b1b')

# Left Ventricle (Thick Red)
lv = patches.FancyBboxPatch((0.55, 0.15), 0.3, 0.3, boxstyle="round,pad=0.04", fc='#fecaca', ec='#b91c1c', lw=3.5)
ax.add_patch(lv)
ax.text(0.70, 0.30, "LEFT VENTRICLE\\n(High Pressure to Body)", ha='center', va='center', fontsize=10, fontweight='bold', color='#7f1d1d')

# Tricuspid & Mitral Valves
ax.annotate('Tricuspid Valve', xy=(0.30, 0.49), xytext=(0.04, 0.49),
            arrowprops=dict(facecolor='#475569', arrowstyle='->', lw=1.5), fontsize=9, fontweight='semibold', color='#334155')
ax.annotate('Mitral / Bicuspid Valve', xy=(0.70, 0.49), xytext=(0.83, 0.49),
            arrowprops=dict(facecolor='#475569', arrowstyle='->', lw=1.5), fontsize=9, fontweight='semibold', color='#334155')

# Circulatory Direction Arrows
# Vena Cava -> RA
ax.annotate('', xy=(0.30, 0.84), xytext=(0.30, 0.92),
            arrowprops=dict(facecolor='#2563eb', edgecolor='#1d4ed8', arrowstyle='simple,tail_width=2,head_width=6,head_length=6'))
ax.text(0.30, 0.93, "Vena Cava\\n(From Body)", ha='center', fontsize=8, color='#1e40af', fontweight='bold')

# RA -> RV
ax.annotate('', xy=(0.30, 0.47), xytext=(0.30, 0.53),
            arrowprops=dict(facecolor='#2563eb', edgecolor='#1d4ed8', arrowstyle='simple,tail_width=2,head_width=6,head_length=6'))

# RV -> Pulmonary Artery (To Lungs)
ax.annotate('', xy=(0.42, 0.88), xytext=(0.36, 0.46),
            arrowprops=dict(facecolor='#2563eb', edgecolor='#1d4ed8', arrowstyle='simple,tail_width=2,head_width=6,head_length=6'))
ax.text(0.42, 0.90, "Pulmonary Artery\\n(To Lungs)", ha='center', fontsize=8, color='#1e40af', fontweight='bold')

# Pulmonary Veins -> LA
ax.annotate('', xy=(0.70, 0.84), xytext=(0.70, 0.92),
            arrowprops=dict(facecolor='#dc2626', edgecolor='#b91c1c', arrowstyle='simple,tail_width=2,head_width=6,head_length=6'))
ax.text(0.70, 0.93, "Pulmonary Veins\\n(From Lungs)", ha='center', fontsize=8, color='#991b1b', fontweight='bold')

# LA -> LV
ax.annotate('', xy=(0.70, 0.47), xytext=(0.70, 0.53),
            arrowprops=dict(facecolor='#dc2626', edgecolor='#b91c1c', arrowstyle='simple,tail_width=2,head_width=6,head_length=6'))

# LV -> Aorta (To Systemic Body)
ax.annotate('', xy=(0.58, 0.88), xytext=(0.64, 0.46),
            arrowprops=dict(facecolor='#dc2626', edgecolor='#b91c1c', arrowstyle='simple,tail_width=2,head_width=6,head_length=6'))
ax.text(0.58, 0.90, "Aorta\\n(To Entire Body)", ha='center', fontsize=8, color='#991b1b', fontweight='bold')

# Septum annotation
ax.plot([0.50, 0.50], [0.12, 0.84], color='#94a3b8', linestyle='--', lw=2)
ax.text(0.50, 0.08, "Interventricular Septum (Muscular Wall)", ha='center', fontsize=8, color='#64748b', style='italic')

ax.set_xlim(0, 1)
ax.set_ylim(0, 1)
ax.axis('off')
plt.tight_layout()
plt.savefig('output.png', dpi=200, bbox_inches='tight')
plt.close()
"""
        }

    if any(k in q for k in ("blood pressure", "hypertension", "bp", "systolic", "diastolic")):
        return {
            "type": "chart",
            "title": "Clinical Blood Pressure Classification Chart",
            "description": "AHA / WHO standard categories for Systolic and Diastolic blood pressure ranges and clinical stages.",
            "renderer": "matplotlib",
            "output_format": "png",
            "script": """import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

fig, ax = plt.subplots(figsize=(9, 5.5), dpi=200)
ax.set_facecolor('#ffffff')
fig.patch.set_facecolor('#ffffff')

categories = ['Normal', 'Elevated', 'Hypertension\\nStage 1', 'Hypertension\\nStage 2', 'Hypertensive\\nCrisis']
systolic_min = [90, 120, 130, 140, 180]
systolic_max = [119, 129, 139, 179, 210]
diastolic_max = [79, 79, 89, 119, 130]

colors = ['#10b981', '#f59e0b', '#f97316', '#ef4444', '#7f1d1d']

x = np.arange(len(categories))
width = 0.35

rects1 = ax.bar(x - width/2, systolic_max, width, label='Systolic (mmHg)', color=colors, alpha=0.85, edgecolor='#334155', linewidth=1)
rects2 = ax.bar(x + width/2, diastolic_max, width, label='Diastolic (mmHg)', color=colors, alpha=0.55, edgecolor='#334155', linewidth=1, hatch='//')

ax.set_ylabel('Pressure (mmHg)', fontsize=12, fontweight='bold', color='#1e293b')
ax.set_title('Blood Pressure Categories (AHA / ACC Standards)', fontsize=15, fontweight='bold', color='#1e293b', pad=15)
ax.set_xticks(x)
ax.set_xticklabels(categories, fontsize=10, fontweight='semibold', color='#334155')
ax.legend(frameon=True, facecolor='#f8fafc', edgecolor='#cbd5e1')
ax.grid(axis='y', linestyle='--', alpha=0.3)

for bar in rects1:
    h = bar.get_height()
    ax.annotate(f'< {h}' if h == 119 else f'{h}',
                xy=(bar.get_x() + bar.get_width() / 2, h),
                xytext=(0, 3), textcoords="offset points", ha='center', va='bottom', fontsize=8, fontweight='bold')

for bar in rects2:
    h = bar.get_height()
    ax.annotate(f'< {h}' if h == 79 else f'{h}',
                xy=(bar.get_x() + bar.get_width() / 2, h),
                xytext=(0, 3), textcoords="offset points", ha='center', va='bottom', fontsize=8, fontweight='bold')

plt.tight_layout()
plt.savefig('output.png', dpi=200, bbox_inches='tight')
plt.close()
"""
        }

    if any(k in q for k in ("brain", "cerebrum", "cerebellum", "lobe", "neuron", "neuro")):
        return {
            "type": "anatomy",
            "title": "Human Brain Functional Lobes Diagram",
            "description": "Functional anatomical breakdown of the human cerebrum: Frontal, Parietal, Temporal, and Occipital lobes with Cerebellum and Brainstem.",
            "renderer": "matplotlib",
            "output_format": "png",
            "script": """import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches

fig, ax = plt.subplots(figsize=(9, 6.5), dpi=200)
ax.set_facecolor('#f8fafc')
fig.patch.set_facecolor('#ffffff')

plt.title("Human Brain: Functional Lobes & Anatomy", fontsize=16, fontweight='bold', pad=18, color='#1e293b')

# Frontal Lobe
fl = patches.FancyBboxPatch((0.10, 0.45), 0.36, 0.38, boxstyle="round,pad=0.05", fc='#fed7aa', ec='#ea580c', lw=2)
ax.add_patch(fl)
ax.text(0.28, 0.64, "FRONTAL LOBE\\n• Decision Making\\n• Motor Control\\n• Speech & Personality", ha='center', va='center', fontsize=9.5, fontweight='bold', color='#9a3412')

# Parietal Lobe
pl = patches.FancyBboxPatch((0.50, 0.45), 0.38, 0.38, boxstyle="round,pad=0.05", fc='#bbf7d0', ec='#16a34a', lw=2)
ax.add_patch(pl)
ax.text(0.69, 0.64, "PARIETAL LOBE\\n• Somatosensory Perception\\n• Spatial Awareness\\n• Touch & Taste", ha='center', va='center', fontsize=9.5, fontweight='bold', color='#166534')

# Temporal Lobe
tl = patches.FancyBboxPatch((0.18, 0.12), 0.38, 0.28, boxstyle="round,pad=0.05", fc='#e9d5ff', ec='#9333ea', lw=2)
ax.add_patch(tl)
ax.text(0.37, 0.26, "TEMPORAL LOBE\\n• Hearing & Auditory\\n• Memory (Hippocampus)\\n• Language Comprehension", ha='center', va='center', fontsize=9, fontweight='bold', color='#581c87')

# Occipital Lobe
ol = patches.FancyBboxPatch((0.60, 0.15), 0.28, 0.26, boxstyle="round,pad=0.05", fc='#fef08a', ec='#ca8a04', lw=2)
ax.add_patch(ol)
ax.text(0.74, 0.28, "OCCIPITAL LOBE\\n• Vision Processing\\n• Color & Motion", ha='center', va='center', fontsize=9, fontweight='bold', color='#854d0e')

# Cerebellum & Brainstem
cb = patches.Circle((0.74, 0.05), 0.08, fc='#cbd5e1', ec='#475569', lw=1.5)
ax.add_patch(cb)
ax.text(0.74, 0.05, "Cerebellum\\n(Balance)", ha='center', va='center', fontsize=7.5, fontweight='bold', color='#334155')

bs = patches.Rectangle((0.48, -0.02), 0.08, 0.12, fc='#94a3b8', ec='#334155', lw=1.5)
ax.add_patch(bs)
ax.text(0.52, 0.04, "Brainstem\\n(Vitals)", ha='center', va='center', fontsize=7.5, fontweight='bold', color='#0f172a')

ax.set_xlim(0, 1)
ax.set_ylim(-0.05, 0.95)
ax.axis('off')
plt.tight_layout()
plt.savefig('output.png', dpi=200, bbox_inches='tight')
plt.close()
"""
        }

    # Default versatile flowchart for processes, treatments, or questions
    return {
        "type": "flowchart",
        "title": "Clinical Guidance & Evaluation Flow",
        "description": "Structured clinical decision flow mapping observations to doctor discussion and follow-up.",
        "renderer": "mermaid",
        "output_format": "mermaid",
        "script": """flowchart TD
    A([Patient Inquiry / Observation]) --> B{Review Prescribed Note}
    B -->|Verified in Clinical Record| C[Clear Everyday Language Explanation]
    B -->|Not in Record or Unknown| D[Formulate Precise Questions for Doctor]
    C --> E[Verify Red-Flag Precautions]
    D --> F[Clinician Consultation & Review]
    E --> G([Informed & Safe Patient Care])
    F --> G
    style A fill:#e0f2fe,stroke:#0284c7,stroke-width:2px,color:#0369a1
    style G fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#15803d
    style B fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#b45309
"""
    }
