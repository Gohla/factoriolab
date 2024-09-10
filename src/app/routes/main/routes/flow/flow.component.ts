import { AsyncPipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import cytoscape from 'cytoscape';
import elk from 'cytoscape-elk';
import { drag, select, Selection, zoom } from 'd3';
import { saveAs } from 'file-saver';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { combineLatest, debounceTime, delay, Subject } from 'rxjs';

import { FlowSettingsComponent, StepsComponent } from '~/components';
import {
  sankey,
  sankeyCenter,
  SankeyGraph,
  SankeyGraphMinimal,
  sankeyJustify,
  SankeyLayout,
  sankeyLeft,
  SankeyLinkExtraProperties,
  sankeyLinkHorizontal,
  sankeyLinkLoop,
  SankeyNode,
  sankeyRight,
} from '~/d3-sankey';
import { coalesce, spread } from '~/helpers';
import {
  FlowData,
  FlowDiagram,
  FlowSettings,
  Link,
  Node,
  SankeyAlign,
} from '~/models';
import { TranslatePipe } from '~/pipes';
import { DisplayService, ExportService, FlowService } from '~/services';
import { Preferences } from '~/store';

export const SVG_ID = 'lab-flow-svg';
const NODE_WIDTH = 32;
cytoscape.use(elk);

@Component({
  selector: 'lab-flow',
  standalone: true,
  imports: [
    AsyncPipe,
    ButtonModule,
    ProgressSpinnerModule,
    FlowSettingsComponent,
    StepsComponent,
    TranslatePipe,
  ],
  templateUrl: './flow.component.html',
  styleUrls: ['./flow.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowComponent implements AfterViewInit {
  ref = inject(ChangeDetectorRef);
  store = inject(Store);
  displaySvc = inject(DisplayService);
  flowSvc = inject(FlowService);
  exportSvc = inject(ExportService);
  destroyRef = inject(DestroyRef);

  flowSettings = this.store.selectSignal(Preferences.selectFlowSettings);

  svgElement = viewChild.required<ElementRef>('svg');
  cy?: cytoscape.Core;

  height = window.innerHeight * 0.75;
  svg: Selection<SVGSVGElement, unknown, null, undefined> | undefined;
  skLayout:
    | SankeyLayout<SankeyGraphMinimal<Node, Link>, Node, Link>
    | undefined;

  loading = signal(true);
  selectedId = signal<string | null>(null);
  resize$ = new Subject<void>();

  @HostListener('window:resize') onResize(): void {
    this.resize$.next();
  }

  ngAfterViewInit(): void {
    combineLatest([
      this.flowSvc.flowData$,
      this.store.select(Preferences.selectFlowSettings),
    ])
      .pipe(debounceTime(0), takeUntilDestroyed(this.destroyRef))
      .subscribe((args) => this.rebuildChart(...args));

    this.resize$
      .pipe(debounceTime(100), delay(100), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cy?.fit());
  }

  rebuildChart(flowData: FlowData, flowSettings: FlowSettings): void {
    this.loading.set(true);

    select(`#${SVG_ID} > *`).remove();
    this.cy?.destroy();
    delete this.cy;

    if (flowData.nodes.length && flowData.links.length) {
      if (flowSettings.diagram === FlowDiagram.Sankey) {
        this.rebuildSankey(flowData, flowSettings);
      } else {
        this.rebuildBoxLine(flowData);
      }
    }

    this.loading.set(false);
    this.ref.detectChanges();
  }

  rebuildSankey(flowData: FlowData, flowSettings: FlowSettings): void {
    let skGraph = this.getLayout(
      flowData,
      flowSettings.sankeyAlign,
      800,
      this.height,
    );
    const columns = Math.max(...skGraph.nodes.map((d) => coalesce(d.depth, 0)));
    const width = (columns + 1) * NODE_WIDTH + columns * NODE_WIDTH * 8;
    const height = Math.min(this.height, width * 0.75);
    skGraph = this.getLayout(flowData, flowSettings.sankeyAlign, width, height);

    const svg = select(this.svgElement().nativeElement)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`);

    svg.call(
      zoom<SVGSVGElement, unknown>().on('zoom', (e): void => {
        svg.selectAll('svg > g').attr('transform', e.transform);
      }),
    );

    // Draw linkages (draw first so rects are drawn over them)
    const link = svg
      .append('g')
      .attr('fill', 'none')
      .attr('stroke-opacity', 0.6)
      .style('will-change', 'opacity')
      .selectAll('g')
      .data(skGraph.links)
      .join('g')
      .style('mix-blend-mode', 'multiply');

    const path = link
      .append('path')
      .attr('id', (l) => `${l.index}`)
      .attr('d', (l) =>
        (l as SankeyLinkExtraProperties).direction === 'forward'
          ? sankeyLinkHorizontal()(l)
          : sankeyLinkLoop(
              coalesce(l.width, 0),
              NODE_WIDTH,
              (l.source as SankeyNode<Node, Link>).y1,
              (l.target as SankeyNode<Node, Link>).y1,
            )(l),
      )
      .attr('stroke', (l) => l.color)
      .attr('stroke-width', (l) => Math.max(1, coalesce(l.width, 0)));

    link.append('title').text((l) => l.name);

    svg
      .append('g')
      .selectAll('text')
      .data(skGraph.links)
      .join('text')
      .append('textPath')
      .attr('startOffset', '4px')
      .attr('href', (l) => `#${l.index}`)
      .text((l) => `${l.text} ${l.name}`);

    // For use inside drag function
    const layout = this.skLayout;

    // Draw rects for nodes
    svg
      .append('g')
      .attr('stroke', 'var(--surface-border)')
      .selectAll<SVGRectElement, SankeyNode<Node, Link>>('rect')
      .data(skGraph.nodes)
      .join('rect')
      .attr('x', (d) => coalesce(d.x0, 0))
      .attr('y', (d) => coalesce(d.y0, 0))
      .attr('height', (d) => this.nodeHeight(d))
      .attr('width', (d) => coalesce(d.x1, 0) - coalesce(d.x0, 0))
      .attr('fill', (d) => d.color)
      .on('click', (e, d) => {
        if (e.defaultPrevented) return;
        this.selectedId.set(d.stepId);
      })
      .call(
        drag<SVGRectElement, SankeyNode<Node, Link>>()
          .subject((d) => d)
          .on('drag', function (this, event, d) {
            const rectY = parseFloat(select(this).attr('y'));
            const rectX = parseFloat(select(this).attr('x'));
            d.y0 = coalesce(d.y0, 0) + event.dy;
            d.y1 = coalesce(d.y1, 0) + event.dy;
            d.x0 = coalesce(d.x0, 0) + event.dx;
            d.x1 = coalesce(d.x1, 0) + event.dx;
            const trX = coalesce(d.x0, 0) - rectX;
            const trY = coalesce(d.y0, 0) - rectY;
            const transform = 'translate(' + trX + ',' + trY + ')';
            select(this).attr('transform', transform);

            // also move the image
            select(`[id='image-${d.id}']`).attr('transform', transform);
            if (layout) {
              layout.update(skGraph);
            }

            // force an update of the path
            path.attr('d', (l) => {
              if ((l as SankeyLinkExtraProperties).direction === 'forward')
                return sankeyLinkHorizontal()(l);

              const source = l.source as SankeyNode<Node, Link>;
              const target = l.target as SankeyNode<Node, Link>;

              return sankeyLinkLoop(
                coalesce(l.width, 0),
                NODE_WIDTH,
                source.y1,
                target.y1,
              )(l);
            });
          }),
      )
      .append('title')
      .text((d) => d.name);

    // Draw icons (for rect height >= 16px)
    svg
      .append('g')
      .selectAll('svg')
      .data(skGraph.nodes.filter((d) => this.nodeHeight(d) >= 16))
      .join('g')
      .attr('id', (d) => `image-${d.id}`)
      .append('svg')
      .attr('viewBox', (d) => d.viewBox)
      .attr('width', (d) => Math.min(30, this.nodeHeight(d) - 2))
      .attr('height', (d) => Math.min(30, this.nodeHeight(d) - 2))
      .attr(
        'x',
        (d) =>
          (coalesce(d.x1, 0) + coalesce(d.x0, 0)) / 2 -
          Math.min(30, this.nodeHeight(d) - 2) / 2,
      )
      .attr(
        'y',
        (d) =>
          (coalesce(d.y1, 0) + coalesce(d.y0, 0)) / 2 -
          Math.min(30, this.nodeHeight(d) - 2) / 2,
      )
      .style('pointer-events', 'none')
      .append('image')
      .attr('href', (d) => coalesce(d.href, ''));

    this.svg = svg;
  }

  rebuildBoxLine(flow: FlowData): void {
    const nodes = flow.nodes.map((n) => ({
      id: n.id,
      data: n,
    }));
    const links = flow.links.map((l) => ({
      id: `${l.source}|${l.target}`,
      data: {
        id: `${l.source}|${l.target}`,
        source: l.source,
        target: l.target,
        value: l.value,
        color: l.color,
        label: `${l.text}\n${l.name}`,
      },
    }));
    const max = Math.max(...flow.links.map((l) => l.value));
    const color =
      getComputedStyle(this.svgElement().nativeElement).getPropertyValue(
        '--text-color',
      ) || 'black';
    const layout = {
      name: 'elk',
      fit: true,
      elk: {
        algorithm: 'layered',
        'spacing.nodeNode': 50,
        'spacing.nodeNodeBetweenLayers': 100,
      },
    } as unknown as cytoscape.LayoutOptions; // Elk layout unrecognized
    this.cy = cytoscape({
      container: this.svgElement().nativeElement,
      elements: [...nodes, ...links],
      style: [
        {
          selector: 'node',
          style: {
            shape: 'round-rectangle',
            height: '64px',
            width: '64px',
            'outline-color': 'data(color)', // Missing types
            'outline-width': '4px', // Missing types
            'background-color': 'data(color)',
            'background-image': 'data(href)',
            'background-position-x': 'data(posX)',
            'background-position-y': 'data(posY)',
            label: 'data(text)',
            color,
            'font-size': '12px',
            'text-valign': 'bottom',
            'text-margin-y': 6,
          },
        } as unknown as cytoscape.Stylesheet,
        {
          selector: 'edge',
          style: {
            width: `mapData(value, 0, ${max}, 1, 16)`,
            label: 'data(label)',
            'text-rotation': 'autorotate',
            color,
            'font-size': '12px',
            'text-wrap': 'wrap',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'control-point-step-size': 96,
          },
        },
      ],
      layout,
    });

    this.cy
      .nodes()
      .on('click', (e) => this.selectedId.set(e.target.data().stepId));
  }

  getLayout(
    data: FlowData,
    align: SankeyAlign,
    width: number,
    height: number,
  ): SankeyGraph<Node, Link> {
    this.skLayout = sankey<Node, Link>()
      .nodeId((d) => d.id)
      .nodeWidth(NODE_WIDTH)
      .nodeAlign(this.getAlign(align))
      .extent([
        [1, 5],
        [width - 1, height - 5],
      ]);

    return this.skLayout({
      nodes: data.nodes
        .filter((n) =>
          data.links.some((l) => l.source === n.id || l.target === n.id),
        )
        .map((d) => spread(d)),
      links: data.links.map((l) => spread(l)),
    });
  }

  getAlign(
    align: SankeyAlign | undefined,
  ): (node: SankeyNode<Node, Link>, n: number) => number {
    switch (align) {
      case SankeyAlign.Left:
        return sankeyLeft;
      case SankeyAlign.Right:
        return sankeyRight;
      case SankeyAlign.Center:
        return sankeyCenter;
      default:
        return sankeyJustify;
    }
  }

  nodeHeight(d: SankeyNode<Node, Link>): number {
    return coalesce(d.y1, 0) - coalesce(d.y0, 0);
  }

  /* Don't test dependencies (file-saver/cytoscape) */
  /* istanbul ignore next */
  saveCytoscapePng(cy: cytoscape.Core): void {
    saveAs(cy.png(), 'factoriolab_flow.png');
  }
}
