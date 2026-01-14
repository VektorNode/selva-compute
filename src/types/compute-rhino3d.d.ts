// rhino-compute.d.ts

declare module 'compute-rhino3d' {
	export interface RhinoComputeConfig {
		version: string;
		url: string;
		authToken: string | null;
		apiKey: string | null;
	}

	export interface DataTree {
		data: {
			ParamName: string;
			InnerTree: Record<string, Array<{ data: any }>>;
		};
		append(path: number[], items: any[]): void;
	}

	export class DataTreeClass implements DataTree {
		constructor(name: string);
		data: {
			ParamName: string;
			InnerTree: Record<string, Array<{ data: any }>>;
		};
		append(path: number[], items: any[]): void;
	}

	export interface GrasshopperModule {
		DataTree: typeof DataTreeClass;
		evaluateDefinition(
			definition: string | Uint8Array,
			trees: unknown[],
			returnJson?: boolean
		): Promise<unknown>;
	}

	export interface RhinoComputeModule extends RhinoComputeConfig {
		getAuthToken(useLocalStorage?: boolean): string | null;
		computeFetch(endpoint: string, arglist: any[], returnJson?: boolean): Promise<any>;
		zipArgs(multiple: boolean, ...args: any[]): any[];
		Grasshopper: GrasshopperModule;

		// Geometry modules
		Extrusion: {
			getWireframe(extrusion: any, multiple?: boolean): Promise<any>;
		};

		BezierCurve: {
			createCubicBeziers(
				sourceCurve: any,
				distanceTolerance: number,
				kinkTolerance: number,
				multiple?: boolean
			): Promise<any>;
			createBeziers(sourceCurve: any, multiple?: boolean): Promise<any>;
		};

		Brep: {
			changeSeam(
				face: any,
				direction: number,
				parameter: number,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			copyTrimCurves(
				trimSource: any,
				surfaceSource: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createBaseballSphere(
				center: any,
				radius: number,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createDevelopableLoft(
				crv0: any,
				crv1: any,
				reverse0: boolean,
				reverse1: boolean,
				density: number,
				multiple?: boolean
			): Promise<any>;
			createDevelopableLoft1(
				rail0: any,
				rail1: any,
				fixedRulings: any,
				multiple?: boolean
			): Promise<any>;
			createPlanarBreps(inputLoops: any, multiple?: boolean): Promise<any>;
			createPlanarBreps1(inputLoops: any, tolerance: number, multiple?: boolean): Promise<any>;
			createPlanarBreps2(inputLoop: any, multiple?: boolean): Promise<any>;
			createPlanarBreps3(inputLoop: any, tolerance: number, multiple?: boolean): Promise<any>;
			createTrimmedSurface(trimSource: any, surfaceSource: any, multiple?: boolean): Promise<any>;
			createTrimmedSurface1(
				trimSource: any,
				surfaceSource: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromCornerPoints(
				corner1: any,
				corner2: any,
				corner3: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromCornerPoints1(
				corner1: any,
				corner2: any,
				corner3: any,
				corner4: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createEdgeSurface(curves: any, multiple?: boolean): Promise<any>;
			createPlanarBreps4(inputLoops: any, multiple?: boolean): Promise<any>;
			createPlanarBreps5(inputLoops: any, tolerance: number, multiple?: boolean): Promise<any>;
			createFromOffsetFace(
				face: any,
				offsetDistance: number,
				offsetTolerance: number,
				bothSides: boolean,
				createSolid: boolean,
				multiple?: boolean
			): Promise<any>;
			createSolid(breps: any, tolerance: number, multiple?: boolean): Promise<any>;
			mergeSurfaces(
				surface0: any,
				surface1: any,
				tolerance: number,
				angleToleranceRadians: number,
				multiple?: boolean
			): Promise<any>;
			mergeSurfaces1(
				brep0: any,
				brep1: any,
				tolerance: number,
				angleToleranceRadians: number,
				multiple?: boolean
			): Promise<any>;
			mergeSurfaces2(
				brep0: any,
				brep1: any,
				tolerance: number,
				angleToleranceRadians: number,
				point0: any,
				point1: any,
				roundness: number,
				smooth: boolean,
				multiple?: boolean
			): Promise<any>;
			createPatch(
				geometry: any,
				startingSurface: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createPatch1(
				geometry: any,
				uSpans: number,
				vSpans: number,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createPatch2(
				geometry: any,
				startingSurface: any,
				uSpans: number,
				vSpans: number,
				trim: boolean,
				tangency: boolean,
				pointSpacing: number,
				flexibility: number,
				surfacePull: number,
				fixEdges: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createPipe(
				rail: any,
				radius: number,
				localBlending: boolean,
				cap: any,
				fitRail: boolean,
				absoluteTolerance: number,
				angleToleranceRadians: number,
				multiple?: boolean
			): Promise<any>;
			createPipe1(
				rail: any,
				railRadiiParameters: number[],
				radii: number[],
				localBlending: boolean,
				cap: any,
				fitRail: boolean,
				absoluteTolerance: number,
				angleToleranceRadians: number,
				multiple?: boolean
			): Promise<any>;
			createThickPipe(
				rail: any,
				radius0: number,
				radius1: number,
				localBlending: boolean,
				cap: any,
				fitRail: boolean,
				absoluteTolerance: number,
				angleToleranceRadians: number,
				multiple?: boolean
			): Promise<any>;
			createThickPipe1(
				rail: any,
				railRadiiParameters: number[],
				radii0: number[],
				radii1: number[],
				localBlending: boolean,
				cap: any,
				fitRail: boolean,
				absoluteTolerance: number,
				angleToleranceRadians: number,
				multiple?: boolean
			): Promise<any>;
			createFromSweep(
				rail: any,
				shape: any,
				closed: boolean,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromSweep1(
				rail: any,
				shapes: any,
				closed: boolean,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromSweep2(
				rail: any,
				shapes: any,
				startPoint: any,
				endPoint: any,
				frameType: any,
				roadlikeNormal: any,
				closed: boolean,
				blendType: any,
				miterType: any,
				tolerance: number,
				rebuildType: any,
				rebuildPointCount: number,
				refitTolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromSweepSegmented(
				rail: any,
				shape: any,
				closed: boolean,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromSweepSegmented1(
				rail: any,
				shapes: any,
				closed: boolean,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromSweepSegmented2(
				rail: any,
				shapes: any,
				startPoint: any,
				endPoint: any,
				frameType: any,
				roadlikeNormal: any,
				closed: boolean,
				blendType: any,
				miterType: any,
				tolerance: number,
				rebuildType: any,
				rebuildPointCount: number,
				refitTolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromSweep3(
				rail1: any,
				rail2: any,
				shape: any,
				closed: boolean,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromSweep4(
				rail1: any,
				rail2: any,
				shapes: any,
				closed: boolean,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromSweep5(
				rail1: any,
				rail2: any,
				shapes: any,
				start: any,
				end: any,
				closed: boolean,
				tolerance: number,
				rebuild: any,
				rebuildPointCount: number,
				refitTolerance: number,
				preserveHeight: boolean,
				multiple?: boolean
			): Promise<any>;
			createFromSweepInParts(
				rail1: any,
				rail2: any,
				shapes: any,
				rail_params: any,
				closed: boolean,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromTaperedExtrude(
				curveToExtrude: any,
				distance: number,
				direction: any,
				basePoint: any,
				draftAngleRadians: number,
				cornerType: any,
				tolerance: number,
				angleToleranceRadians: number,
				multiple?: boolean
			): Promise<any>;
			createFromTaperedExtrude1(
				curveToExtrude: any,
				distance: number,
				direction: any,
				basePoint: any,
				draftAngleRadians: number,
				cornerType: any,
				multiple?: boolean
			): Promise<any>;
			createFromTaperedExtrudeWithRef(
				curve: any,
				direction: any,
				distance: number,
				draftAngle: number,
				plane: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createBlendSurface(
				face0: any,
				edge0: any,
				domain0: any,
				rev0: boolean,
				continuity0: any,
				face1: any,
				edge1: any,
				domain1: any,
				rev1: boolean,
				continuity1: any,
				multiple?: boolean
			): Promise<any>;
			createBlendShape(
				face0: any,
				edge0: any,
				t0: number,
				rev0: boolean,
				continuity0: any,
				face1: any,
				edge1: any,
				t1: number,
				rev1: boolean,
				continuity1: any,
				multiple?: boolean
			): Promise<any>;
			createFilletSurface(
				face0: any,
				uv0: any,
				face1: any,
				uv1: any,
				radius: number,
				extend: boolean,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFilletSurface1(
				face0: any,
				uv0: any,
				face1: any,
				uv1: any,
				radius: number,
				trim: boolean,
				extend: boolean,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createChamferSurface(
				face0: any,
				uv0: any,
				radius0: number,
				face1: any,
				uv1: any,
				radius1: number,
				extend: boolean,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createChamferSurface1(
				face0: any,
				uv0: any,
				radius0: number,
				face1: any,
				uv1: any,
				radius1: number,
				trim: boolean,
				extend: boolean,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFilletEdges(
				brep: any,
				edgeIndices: number[],
				startRadii: number[],
				endRadii: number[],
				blendType: any,
				railType: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createOffsetBrep(
				brep: any,
				distance: number,
				solid: boolean,
				extend: boolean,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			removeFins(brep: any, multiple?: boolean): Promise<any>;
			createFromJoinedEdges(
				brep0: any,
				edgeIndex0: number,
				brep1: any,
				edgeIndex1: number,
				joinTolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromLoft(
				curves: any,
				start: any,
				end: any,
				loftType: any,
				closed: boolean,
				multiple?: boolean
			): Promise<any>;
			createFromLoftRebuild(
				curves: any,
				start: any,
				end: any,
				loftType: any,
				closed: boolean,
				rebuildPointCount: number,
				multiple?: boolean
			): Promise<any>;
			createFromLoftRefit(
				curves: any,
				start: any,
				end: any,
				loftType: any,
				closed: boolean,
				refitTolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromLoft1(
				curves: any,
				start: any,
				end: any,
				StartTangent: boolean,
				EndTangent: boolean,
				StartTrim: any,
				EndTrim: any,
				loftType: any,
				closed: boolean,
				multiple?: boolean
			): Promise<any>;
			createPlanarUnion(
				breps: any,
				plane: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createPlanarUnion1(
				b0: any,
				b1: any,
				plane: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createPlanarDifference(
				b0: any,
				b1: any,
				plane: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createPlanarIntersection(
				b0: any,
				b1: any,
				plane: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createBooleanUnion(breps: any, tolerance: number, multiple?: boolean): Promise<any>;
			createBooleanUnion1(
				breps: any,
				tolerance: number,
				manifoldOnly: boolean,
				multiple?: boolean
			): Promise<any>;
			createBooleanIntersection(
				firstSet: any,
				secondSet: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createBooleanIntersection1(
				firstSet: any,
				secondSet: any,
				tolerance: number,
				manifoldOnly: boolean,
				multiple?: boolean
			): Promise<any>;
			createBooleanIntersection2(
				firstBrep: any,
				secondBrep: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createBooleanIntersection3(
				firstBrep: any,
				secondBrep: any,
				tolerance: number,
				manifoldOnly: boolean,
				multiple?: boolean
			): Promise<any>;
			createBooleanDifference(
				firstSet: any,
				secondSet: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createBooleanDifference1(
				firstSet: any,
				secondSet: any,
				tolerance: number,
				manifoldOnly: boolean,
				multiple?: boolean
			): Promise<any>;
			createBooleanDifference2(
				firstBrep: any,
				secondBrep: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createBooleanDifference3(
				firstBrep: any,
				secondBrep: any,
				tolerance: number,
				manifoldOnly: boolean,
				multiple?: boolean
			): Promise<any>;
			createBooleanSplit(
				firstBrep: any,
				secondBrep: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createBooleanSplit1(
				firstSet: any,
				secondSet: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createShell(
				brep: any,
				facesToRemove: number[],
				distance: number,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			joinBreps(brepsToJoin: any, tolerance: number, multiple?: boolean): Promise<any>;
			mergeBreps(brepsToMerge: any, tolerance: number, multiple?: boolean): Promise<any>;
			createContourCurves(
				brepToContour: any,
				contourStart: any,
				contourEnd: any,
				interval: number,
				multiple?: boolean
			): Promise<any>;
			createContourCurves1(brepToContour: any, sectionPlane: any, multiple?: boolean): Promise<any>;
			createCurvatureAnalysisMesh(brep: any, state: any, multiple?: boolean): Promise<any>;
			getRegions(brep: any, multiple?: boolean): Promise<any>;
			getWireframe(brep: any, density: number, multiple?: boolean): Promise<any>;
			closestPoint(brep: any, testPoint: any, multiple?: boolean): Promise<any>;
			isPointInside(
				brep: any,
				point: any,
				tolerance: number,
				strictlyIn: boolean,
				multiple?: boolean
			): Promise<any>;
			getPointInside(brep: any, tolerance: number, multiple?: boolean): Promise<any>;
			capPlanarHoles(brep: any, tolerance: number, multiple?: boolean): Promise<any>;
			join(
				brep: any,
				otherBrep: any,
				tolerance: number,
				compact: boolean,
				multiple?: boolean
			): Promise<any>;
			joinNakedEdges(brep: any, tolerance: number, multiple?: boolean): Promise<any>;
			mergeCoplanarFaces(brep: any, tolerance: number, multiple?: boolean): Promise<any>;
			mergeCoplanarFaces1(
				brep: any,
				tolerance: number,
				angleTolerance: number,
				multiple?: boolean
			): Promise<any>;
			split(
				brep: any,
				cutter: any,
				intersectionTolerance: number,
				multiple?: boolean
			): Promise<any>;
			split1(
				brep: any,
				cutter: any,
				intersectionTolerance: number,
				multiple?: boolean
			): Promise<any>;
			split2(
				brep: any,
				cutters: any,
				intersectionTolerance: number,
				multiple?: boolean
			): Promise<any>;
			split3(
				brep: any,
				cutters: any,
				intersectionTolerance: number,
				multiple?: boolean
			): Promise<any>;
			split4(
				brep: any,
				cutters: any,
				normal: any,
				planView: boolean,
				intersectionTolerance: number,
				multiple?: boolean
			): Promise<any>;
			trim(brep: any, cutter: any, intersectionTolerance: number, multiple?: boolean): Promise<any>;
			trim1(
				brep: any,
				cutter: any,
				intersectionTolerance: number,
				multiple?: boolean
			): Promise<any>;
			unjoinEdges(brep: any, edgesToUnjoin: number[], multiple?: boolean): Promise<any>;
			joinEdges(
				brep: any,
				edgeIndex0: number,
				edgeIndex1: number,
				joinTolerance: number,
				compact: boolean,
				multiple?: boolean
			): Promise<any>;
			transformComponent(
				brep: any,
				components: any,
				xform: any,
				tolerance: number,
				timeLimit: number,
				useMultipleThreads: boolean,
				multiple?: boolean
			): Promise<any>;
			getArea(brep: any, multiple?: boolean): Promise<any>;
			getArea1(
				brep: any,
				relativeTolerance: number,
				absoluteTolerance: number,
				multiple?: boolean
			): Promise<any>;
			getVolume(brep: any, multiple?: boolean): Promise<any>;
			getVolume1(
				brep: any,
				relativeTolerance: number,
				absoluteTolerance: number,
				multiple?: boolean
			): Promise<any>;
			rebuildTrimsForV2(brep: any, face: any, nurbsSurface: any, multiple?: boolean): Promise<any>;
			makeValidForV2(brep: any, multiple?: boolean): Promise<any>;
			repair(brep: any, tolerance: number, multiple?: boolean): Promise<any>;
			removeHoles(brep: any, tolerance: number, multiple?: boolean): Promise<any>;
			removeHoles1(brep: any, loops: any, tolerance: number, multiple?: boolean): Promise<any>;
		};

		BrepFace: {
			pullPointsToFace(
				brepface: any,
				points: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			draftAnglePoint(
				brepface: any,
				testPoint: any,
				testAngle: number,
				pullDirection: any,
				edge: boolean,
				multiple?: boolean
			): Promise<any>;
			removeHoles(brepface: any, tolerance: number, multiple?: boolean): Promise<any>;
			shrinkSurfaceToEdge(brepface: any, multiple?: boolean): Promise<any>;
			split(brepface: any, curves: any, tolerance: number, multiple?: boolean): Promise<any>;
			isPointOnFace(brepface: any, u: number, v: number, multiple?: boolean): Promise<any>;
			isPointOnFace1(
				brepface: any,
				u: number,
				v: number,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			trimAwareIsoIntervals(
				brepface: any,
				direction: number,
				constantParameter: number,
				multiple?: boolean
			): Promise<any>;
			trimAwareIsoCurve(
				brepface: any,
				direction: number,
				constantParameter: number,
				multiple?: boolean
			): Promise<any>;
			changeSurface(brepface: any, surfaceIndex: number, multiple?: boolean): Promise<any>;
			rebuildEdges(
				brepface: any,
				tolerance: number,
				rebuildSharedEdges: boolean,
				rebuildVertices: boolean,
				multiple?: boolean
			): Promise<any>;
		};

		Curve: {
			getConicSectionType(curve: any, multiple?: boolean): Promise<any>;
			createInterpolatedCurve(points: any, degree: number, multiple?: boolean): Promise<any>;
			createInterpolatedCurve1(
				points: any,
				degree: number,
				knots: any,
				multiple?: boolean
			): Promise<any>;
			createInterpolatedCurve2(
				points: any,
				degree: number,
				knots: any,
				startTangent: any,
				endTangent: any,
				multiple?: boolean
			): Promise<any>;
			createSoftEditCurve(
				curve: any,
				t: number,
				delta: any,
				length: number,
				fixEnds: boolean,
				multiple?: boolean
			): Promise<any>;
			createFilletCornersCurve(
				curve: any,
				radius: number,
				tolerance: number,
				angleTolerance: number,
				multiple?: boolean
			): Promise<any>;
			createArcBlend(
				startPt: any,
				startDir: any,
				endPt: any,
				endDir: any,
				controlPointLengthRatio: number,
				multiple?: boolean
			): Promise<any>;
			createMeanCurve(
				curveA: any,
				curveB: any,
				angleToleranceRadians: number,
				multiple?: boolean
			): Promise<any>;
			createMeanCurve1(curveA: any, curveB: any, multiple?: boolean): Promise<any>;
			createBlendCurve(curveA: any, curveB: any, continuity: any, multiple?: boolean): Promise<any>;
			createBlendCurve1(
				curveA: any,
				curveB: any,
				continuity: any,
				bulgeA: number,
				bulgeB: number,
				multiple?: boolean
			): Promise<any>;
			createBlendCurve2(
				curve0: any,
				t0: number,
				reverse0: boolean,
				continuity0: any,
				curve1: any,
				t1: number,
				reverse1: boolean,
				continuity1: any,
				multiple?: boolean
			): Promise<any>;
			createTweenCurves(
				curve0: any,
				curve1: any,
				numCurves: number,
				multiple?: boolean
			): Promise<any>;
			createTweenCurves1(
				curve0: any,
				curve1: any,
				numCurves: number,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createTweenCurvesWithMatching(
				curve0: any,
				curve1: any,
				numCurves: number,
				multiple?: boolean
			): Promise<any>;
			createTweenCurvesWithMatching1(
				curve0: any,
				curve1: any,
				numCurves: number,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createTweenCurvesWithSampling(
				curve0: any,
				curve1: any,
				numCurves: number,
				numSamples: number,
				multiple?: boolean
			): Promise<any>;
			createTweenCurvesWithSampling1(
				curve0: any,
				curve1: any,
				numCurves: number,
				numSamples: number,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			joinCurves(inputCurves: any, multiple?: boolean): Promise<any>;
			joinCurves1(inputCurves: any, joinTolerance: number, multiple?: boolean): Promise<any>;
			joinCurves2(
				inputCurves: any,
				joinTolerance: number,
				preserveDirection: boolean,
				multiple?: boolean
			): Promise<any>;
			makeEndsMeet(
				curveA: any,
				adjustStartCurveA: boolean,
				curveB: any,
				adjustStartCurveB: boolean,
				multiple?: boolean
			): Promise<any>;
			createFillet(
				curve0: any,
				curve1: any,
				radius: number,
				t0Base: number,
				t1Base: number,
				multiple?: boolean
			): Promise<any>;
			createFilletCurves(
				curve0: any,
				point0: any,
				curve1: any,
				point1: any,
				radius: number,
				join: boolean,
				trim: boolean,
				arcExtension: boolean,
				tolerance: number,
				angleTolerance: number,
				multiple?: boolean
			): Promise<any>;
			createBooleanUnion(curves: any, multiple?: boolean): Promise<any>;
			createBooleanUnion1(curves: any, tolerance: number, multiple?: boolean): Promise<any>;
			createBooleanIntersection(curveA: any, curveB: any, multiple?: boolean): Promise<any>;
			createBooleanIntersection1(
				curveA: any,
				curveB: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createBooleanDifference(curveA: any, curveB: any, multiple?: boolean): Promise<any>;
			createBooleanDifference1(
				curveA: any,
				curveB: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createBooleanDifference2(curveA: any, subtractors: any, multiple?: boolean): Promise<any>;
			createBooleanDifference3(
				curveA: any,
				subtractors: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createBooleanRegions(
				curves: any,
				plane: any,
				points: any,
				combineRegions: boolean,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createBooleanRegions1(
				curves: any,
				plane: any,
				combineRegions: boolean,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createTextOutlines(
				text: string,
				font: string,
				textHeight: number,
				textStyle: number,
				closeLoops: boolean,
				plane: any,
				smallCapsScale: number,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createCurve2View(
				curveA: any,
				curveB: any,
				vectorA: any,
				vectorB: any,
				tolerance: number,
				angleTolerance: number,
				multiple?: boolean
			): Promise<any>;
			doDirectionsMatch(curveA: any, curveB: any, multiple?: boolean): Promise<any>;
			projectToMesh(
				curve: any,
				mesh: any,
				direction: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			projectToMesh1(
				curve: any,
				meshes: any,
				direction: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			projectToMesh2(
				curves: any,
				meshes: any,
				direction: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			projectToBrep(
				curve: any,
				brep: any,
				direction: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			projectToBrep1(
				curve: any,
				breps: any,
				direction: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			projectToBrep2(
				curve: any,
				breps: any,
				direction: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			projectToBrep3(
				curves: any,
				breps: any,
				direction: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			projectToBrep4(
				curves: any,
				breps: any,
				direction: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			projectToPlane(curve: any, plane: any, multiple?: boolean): Promise<any>;
			pullToBrepFace(curve: any, face: any, tolerance: number, multiple?: boolean): Promise<any>;
			planarClosedCurveRelationship(
				curveA: any,
				curveB: any,
				testPlane: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			planarCurveCollision(
				curveA: any,
				curveB: any,
				testPlane: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			duplicateSegments(curve: any, multiple?: boolean): Promise<any>;
			smooth(
				curve: any,
				smoothFactor: number,
				bXSmooth: boolean,
				bYSmooth: boolean,
				bZSmooth: boolean,
				bFixBoundaries: boolean,
				coordinateSystem: any,
				multiple?: boolean
			): Promise<any>;
			smooth1(
				curve: any,
				smoothFactor: number,
				bXSmooth: boolean,
				bYSmooth: boolean,
				bZSmooth: boolean,
				bFixBoundaries: boolean,
				coordinateSystem: any,
				plane: any,
				multiple?: boolean
			): Promise<any>;
			getLocalPerpPoint(
				curve: any,
				testPoint: any,
				seedParmameter: number,
				multiple?: boolean
			): Promise<any>;
			getLocalPerpPoint1(
				curve: any,
				testPoint: any,
				seedParmameter: number,
				subDomain: any,
				multiple?: boolean
			): Promise<any>;
			getLocalTangentPoint(
				curve: any,
				testPoint: any,
				seedParmameter: number,
				multiple?: boolean
			): Promise<any>;
			getLocalTangentPoint1(
				curve: any,
				testPoint: any,
				seedParmameter: number,
				subDomain: any,
				multiple?: boolean
			): Promise<any>;
			inflectionPoints(curve: any, multiple?: boolean): Promise<any>;
			maxCurvaturePoints(curve: any, multiple?: boolean): Promise<any>;
			makeClosed(curve: any, tolerance: number, multiple?: boolean): Promise<any>;
			lcoalClosestPoint(curve: any, testPoint: any, seed: number, multiple?: boolean): Promise<any>;
			localClosestPoint(curve: any, testPoint: any, seed: number, multiple?: boolean): Promise<any>;
			closestPoint(curve: any, testPoint: any, multiple?: boolean): Promise<any>;
			closestPoint1(
				curve: any,
				testPoint: any,
				maximumDistance: number,
				multiple?: boolean
			): Promise<any>;
			closestPoints(curve: any, otherCurve: any, multiple?: boolean): Promise<any>;
			contains(curve: any, testPoint: any, multiple?: boolean): Promise<any>;
			contains1(curve: any, testPoint: any, plane: any, multiple?: boolean): Promise<any>;
			contains2(
				curve: any,
				testPoint: any,
				plane: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			extremeParameters(curve: any, direction: any, multiple?: boolean): Promise<any>;
			createPeriodicCurve(curve: any, multiple?: boolean): Promise<any>;
			createPeriodicCurve1(curve: any, smooth: boolean, multiple?: boolean): Promise<any>;
			pointAtLength(curve: any, length: number, multiple?: boolean): Promise<any>;
			pointAtNormalizedLength(curve: any, length: number, multiple?: boolean): Promise<any>;
			perpendicularFrameAt(curve: any, t: number, multiple?: boolean): Promise<any>;
			getPerpendicularFrames(curve: any, parameters: number[], multiple?: boolean): Promise<any>;
			getLength(curve: any, multiple?: boolean): Promise<any>;
			getLength1(curve: any, fractionalTolerance: number, multiple?: boolean): Promise<any>;
			getLength2(curve: any, subdomain: any, multiple?: boolean): Promise<any>;
			getLength3(
				curve: any,
				fractionalTolerance: number,
				subdomain: any,
				multiple?: boolean
			): Promise<any>;
			isShort(curve: any, tolerance: number, multiple?: boolean): Promise<any>;
			isShort1(curve: any, tolerance: number, subdomain: any, multiple?: boolean): Promise<any>;
			removeShortSegments(curve: any, tolerance: number, multiple?: boolean): Promise<any>;
			lengthParameter(curve: any, segmentLength: number, multiple?: boolean): Promise<any>;
			lengthParameter1(
				curve: any,
				segmentLength: number,
				fractionalTolerance: number,
				multiple?: boolean
			): Promise<any>;
			lengthParameter2(
				curve: any,
				segmentLength: number,
				subdomain: any,
				multiple?: boolean
			): Promise<any>;
			lengthParameter3(
				curve: any,
				segmentLength: number,
				fractionalTolerance: number,
				subdomain: any,
				multiple?: boolean
			): Promise<any>;
			normalizedLengthParameter(curve: any, s: number, multiple?: boolean): Promise<any>;
			normalizedLengthParameter1(
				curve: any,
				s: number,
				fractionalTolerance: number,
				multiple?: boolean
			): Promise<any>;
			normalizedLengthParameter2(
				curve: any,
				s: number,
				subdomain: any,
				multiple?: boolean
			): Promise<any>;
			normalizedLengthParameter3(
				curve: any,
				s: number,
				fractionalTolerance: number,
				subdomain: any,
				multiple?: boolean
			): Promise<any>;
			normalizedLengthParameters(
				curve: any,
				s: number[],
				absoluteTolerance: number,
				multiple?: boolean
			): Promise<any>;
			normalizedLengthParameters1(
				curve: any,
				s: number[],
				absoluteTolerance: number,
				fractionalTolerance: number,
				multiple?: boolean
			): Promise<any>;
			normalizedLengthParameters2(
				curve: any,
				s: number[],
				absoluteTolerance: number,
				subdomain: any,
				multiple?: boolean
			): Promise<any>;
			normalizedLengthParameters3(
				curve: any,
				s: number[],
				absoluteTolerance: number,
				fractionalTolerance: number,
				subdomain: any,
				multiple?: boolean
			): Promise<any>;
			divideByCount(
				curve: any,
				segmentCount: number,
				includeEnds: boolean,
				multiple?: boolean
			): Promise<any>;
			divideByCount1(
				curve: any,
				segmentCount: number,
				includeEnds: boolean,
				multiple?: boolean
			): Promise<any>;
			divideByLength(
				curve: any,
				segmentLength: number,
				includeEnds: boolean,
				multiple?: boolean
			): Promise<any>;
			divideByLength1(
				curve: any,
				segmentLength: number,
				includeEnds: boolean,
				reverse: boolean,
				multiple?: boolean
			): Promise<any>;
			divideByLength2(
				curve: any,
				segmentLength: number,
				includeEnds: boolean,
				multiple?: boolean
			): Promise<any>;
			divideByLength3(
				curve: any,
				segmentLength: number,
				includeEnds: boolean,
				reverse: boolean,
				multiple?: boolean
			): Promise<any>;
			divideEquidistant(curve: any, distance: number, multiple?: boolean): Promise<any>;
			divideAsContour(
				curve: any,
				contourStart: any,
				contourEnd: any,
				interval: number,
				multiple?: boolean
			): Promise<any>;
			trim(curve: any, side: any, length: number, multiple?: boolean): Promise<any>;
			split(curve: any, cutter: any, tolerance: number, multiple?: boolean): Promise<any>;
			split1(
				curve: any,
				cutter: any,
				tolerance: number,
				angleToleranceRadians: number,
				multiple?: boolean
			): Promise<any>;
			split2(curve: any, cutter: any, tolerance: number, multiple?: boolean): Promise<any>;
			split3(
				curve: any,
				cutter: any,
				tolerance: number,
				angleToleranceRadians: number,
				multiple?: boolean
			): Promise<any>;
			extend(curve: any, t0: number, t1: number, multiple?: boolean): Promise<any>;
			extend1(curve: any, domain: any, multiple?: boolean): Promise<any>;
			extend2(curve: any, side: any, length: number, style: any, multiple?: boolean): Promise<any>;
			extend3(curve: any, side: any, style: any, geometry: any, multiple?: boolean): Promise<any>;
			extend4(curve: any, side: any, style: any, endPoint: any, multiple?: boolean): Promise<any>;
			extendOnSurface(curve: any, side: any, surface: any, multiple?: boolean): Promise<any>;
			extendOnSurface1(curve: any, side: any, face: any, multiple?: boolean): Promise<any>;
			extendByLine(curve: any, side: any, geometry: any, multiple?: boolean): Promise<any>;
			extendByArc(curve: any, side: any, geometry: any, multiple?: boolean): Promise<any>;
			simplify(
				curve: any,
				options: any,
				distanceTolerance: number,
				angleToleranceRadians: number,
				multiple?: boolean
			): Promise<any>;
			simplifyEnd(
				curve: any,
				end: any,
				options: any,
				distanceTolerance: number,
				angleToleranceRadians: number,
				multiple?: boolean
			): Promise<any>;
			fair(
				curve: any,
				distanceTolerance: number,
				angleTolerance: number,
				clampStart: number,
				clampEnd: number,
				iterations: number,
				multiple?: boolean
			): Promise<any>;
			fit(
				curve: any,
				degree: number,
				fitTolerance: number,
				angleTolerance: number,
				multiple?: boolean
			): Promise<any>;
			rebuild(
				curve: any,
				pointCount: number,
				degree: number,
				preserveTangents: boolean,
				multiple?: boolean
			): Promise<any>;
			toPolyline(
				curve: any,
				mainSegmentCount: number,
				subSegmentCount: number,
				maxAngleRadians: number,
				maxChordLengthRatio: number,
				maxAspectRatio: number,
				tolerance: number,
				minEdgeLength: number,
				maxEdgeLength: number,
				keepStartPoint: boolean,
				multiple?: boolean
			): Promise<any>;
			toPolyline1(
				curve: any,
				mainSegmentCount: number,
				subSegmentCount: number,
				maxAngleRadians: number,
				maxChordLengthRatio: number,
				maxAspectRatio: number,
				tolerance: number,
				minEdgeLength: number,
				maxEdgeLength: number,
				keepStartPoint: boolean,
				curveDomain: any,
				multiple?: boolean
			): Promise<any>;
			toPolyline2(
				curve: any,
				tolerance: number,
				angleTolerance: number,
				minimumLength: number,
				maximumLength: number,
				multiple?: boolean
			): Promise<any>;
			toArcsAndLines(
				curve: any,
				tolerance: number,
				angleTolerance: number,
				minimumLength: number,
				maximumLength: number,
				multiple?: boolean
			): Promise<any>;
			pullToMesh(curve: any, mesh: any, tolerance: number, multiple?: boolean): Promise<any>;
			offset(
				curve: any,
				plane: any,
				distance: number,
				tolerance: number,
				cornerStyle: any,
				multiple?: boolean
			): Promise<any>;
			offset1(
				curve: any,
				directionPoint: any,
				normal: any,
				distance: number,
				tolerance: number,
				cornerStyle: any,
				multiple?: boolean
			): Promise<any>;
			offset2(
				curve: any,
				directionPoint: any,
				normal: any,
				distance: number,
				tolerance: number,
				angleTolerance: number,
				loose: boolean,
				cornerStyle: any,
				endStyle: any,
				multiple?: boolean
			): Promise<any>;
			ribbonOffset(
				curve: any,
				distance: number,
				blendRadius: number,
				directionPoint: any,
				normal: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			offsetOnSurface(
				curve: any,
				face: any,
				distance: number,
				fittingTolerance: number,
				multiple?: boolean
			): Promise<any>;
			offsetOnSurface1(
				curve: any,
				face: any,
				throughPoint: any,
				fittingTolerance: number,
				multiple?: boolean
			): Promise<any>;
			offsetOnSurface2(
				curve: any,
				face: any,
				curveParameters: number[],
				offsetDistances: number[],
				fittingTolerance: number,
				multiple?: boolean
			): Promise<any>;
			offsetOnSurface3(
				curve: any,
				surface: any,
				distance: number,
				fittingTolerance: number,
				multiple?: boolean
			): Promise<any>;
			offsetOnSurface4(
				curve: any,
				surface: any,
				throughPoint: any,
				fittingTolerance: number,
				multiple?: boolean
			): Promise<any>;
			offsetOnSurface5(
				curve: any,
				surface: any,
				curveParameters: number[],
				offsetDistances: number[],
				fittingTolerance: number,
				multiple?: boolean
			): Promise<any>;
			pullToBrepFace1(curve: any, face: any, tolerance: number, multiple?: boolean): Promise<any>;
			offsetNormalToSurface(
				curve: any,
				surface: any,
				height: number,
				multiple?: boolean
			): Promise<any>;
		};

		GeometryBase: {
			getBoundingBox(geometrybase: any, accurate: boolean, multiple?: boolean): Promise<any>;
			getBoundingBox1(geometrybase: any, xform: any, multiple?: boolean): Promise<any>;
			geometryEquals(first: any, second: any, multiple?: boolean): Promise<any>;
		};

		AreaMassProperties: {
			compute(closedPlanarCurve: any, multiple?: boolean): Promise<any>;
			compute1(closedPlanarCurve: any, planarTolerance: number, multiple?: boolean): Promise<any>;
			compute2(hatch: any, multiple?: boolean): Promise<any>;
			compute3(mesh: any, multiple?: boolean): Promise<any>;
			compute4(
				mesh: any,
				area: boolean,
				firstMoments: boolean,
				secondMoments: boolean,
				productMoments: boolean,
				multiple?: boolean
			): Promise<any>;
			compute5(brep: any, multiple?: boolean): Promise<any>;
			compute6(
				brep: any,
				area: boolean,
				firstMoments: boolean,
				secondMoments: boolean,
				productMoments: boolean,
				multiple?: boolean
			): Promise<any>;
			compute7(surface: any, multiple?: boolean): Promise<any>;
			compute8(
				surface: any,
				area: boolean,
				firstMoments: boolean,
				secondMoments: boolean,
				productMoments: boolean,
				multiple?: boolean
			): Promise<any>;
			compute9(geometry: any, multiple?: boolean): Promise<any>;
			compute10(
				geometry: any,
				area: boolean,
				firstMoments: boolean,
				secondMoments: boolean,
				productMoments: boolean,
				multiple?: boolean
			): Promise<any>;
		};

		VolumeMassProperties: {
			compute(mesh: any, multiple?: boolean): Promise<any>;
			compute1(
				mesh: any,
				volume: boolean,
				firstMoments: boolean,
				secondMoments: boolean,
				productMoments: boolean,
				multiple?: boolean
			): Promise<any>;
			compute2(brep: any, multiple?: boolean): Promise<any>;
			compute3(
				brep: any,
				volume: boolean,
				firstMoments: boolean,
				secondMoments: boolean,
				productMoments: boolean,
				multiple?: boolean
			): Promise<any>;
			compute4(surface: any, multiple?: boolean): Promise<any>;
			compute5(
				surface: any,
				volume: boolean,
				firstMoments: boolean,
				secondMoments: boolean,
				productMoments: boolean,
				multiple?: boolean
			): Promise<any>;
			compute6(geometry: any, multiple?: boolean): Promise<any>;
			compute7(
				geometry: any,
				volume: boolean,
				firstMoments: boolean,
				secondMoments: boolean,
				productMoments: boolean,
				multiple?: boolean
			): Promise<any>;
			sum(volumemassproperties: any, summand: any, multiple?: boolean): Promise<any>;
		};

		Mesh: {
			createFromPlane(
				plane: any,
				xInterval: any,
				yInterval: any,
				xCount: number,
				yCount: number,
				multiple?: boolean
			): Promise<any>;
			createFromFilteredFaceList(
				original: any,
				inclusion: boolean[],
				multiple?: boolean
			): Promise<any>;
			createFromBox(
				box: any,
				xCount: number,
				yCount: number,
				zCount: number,
				multiple?: boolean
			): Promise<any>;
			createFromBox1(
				box: any,
				xCount: number,
				yCount: number,
				zCount: number,
				multiple?: boolean
			): Promise<any>;
			createFromBox2(
				corners: any,
				xCount: number,
				yCount: number,
				zCount: number,
				multiple?: boolean
			): Promise<any>;
			createFromSphere(
				sphere: any,
				xCount: number,
				yCount: number,
				multiple?: boolean
			): Promise<any>;
			createIcoSphere(sphere: any, subdivisions: number, multiple?: boolean): Promise<any>;
			createQuadSphere(sphere: any, subdivisions: number, multiple?: boolean): Promise<any>;
			createFromCylinder(
				cylinder: any,
				vertical: number,
				around: number,
				multiple?: boolean
			): Promise<any>;
			createFromCylinder1(
				cylinder: any,
				vertical: number,
				around: number,
				capBottom: boolean,
				capTop: boolean,
				multiple?: boolean
			): Promise<any>;
			createFromCylinder2(
				cylinder: any,
				vertical: number,
				around: number,
				capBottom: boolean,
				capTop: boolean,
				quadCaps: boolean,
				multiple?: boolean
			): Promise<any>;
			createFromCone(cone: any, vertical: number, around: number, multiple?: boolean): Promise<any>;
			createFromCone1(
				cone: any,
				vertical: number,
				around: number,
				solid: boolean,
				multiple?: boolean
			): Promise<any>;
			createFromCone2(
				cone: any,
				vertical: number,
				around: number,
				solid: boolean,
				quadCaps: boolean,
				multiple?: boolean
			): Promise<any>;
			createFromTorus(
				torus: any,
				vertical: number,
				around: number,
				multiple?: boolean
			): Promise<any>;
			createFromPlanarBoundary(boundary: any, parameters: any, multiple?: boolean): Promise<any>;
			createFromPlanarBoundary1(
				boundary: any,
				parameters: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromClosedPolyline(polyline: any, multiple?: boolean): Promise<any>;
			createFromTessellation(
				points: any,
				edges: any,
				plane: any,
				allowNewVertices: boolean,
				multiple?: boolean
			): Promise<any>;
			createFromBrep(brep: any, multiple?: boolean): Promise<any>;
			createFromBrep1(brep: any, meshingParameters: any, multiple?: boolean): Promise<any>;
			createFromSurface(surface: any, multiple?: boolean): Promise<any>;
			createFromSurface1(surface: any, meshingParameters: any, multiple?: boolean): Promise<any>;
			createFromSubD(subd: any, displayDensity: number, multiple?: boolean): Promise<any>;
			createPatch(
				outerBoundary: any,
				angleToleranceRadians: number,
				pullbackSurface: any,
				innerBoundaryCurves: any,
				innerBothSideCurves: any,
				innerPoints: any,
				trimback: boolean,
				divisions: number,
				multiple?: boolean
			): Promise<any>;
			createBooleanUnion(meshes: any, multiple?: boolean): Promise<any>;
			createBooleanDifference(firstSet: any, secondSet: any, multiple?: boolean): Promise<any>;
			createBooleanIntersection(firstSet: any, secondSet: any, multiple?: boolean): Promise<any>;
			createBooleanSplit(meshesToSplit: any, meshSplitters: any, multiple?: boolean): Promise<any>;
			createFromCurvePipe(
				curve: any,
				radius: number,
				segments: number,
				accuracy: number,
				capType: any,
				faceted: boolean,
				intervals: any,
				multiple?: boolean
			): Promise<any>;
			createFromCurveExtrusion(
				curve: any,
				direction: any,
				parameters: any,
				boundingBox: any,
				multiple?: boolean
			): Promise<any>;
			createFromIterativeCleanup(meshes: any, tolerance: number, multiple?: boolean): Promise<any>;
			requireIterativeCleanup(meshes: any, tolerance: number, multiple?: boolean): Promise<any>;
			volume(mesh: any, multiple?: boolean): Promise<any>;
			isPointInside(
				mesh: any,
				point: any,
				tolerance: number,
				strictlyIn: boolean,
				multiple?: boolean
			): Promise<any>;
			smooth(
				mesh: any,
				smoothFactor: number,
				bXSmooth: boolean,
				bYSmooth: boolean,
				bZSmooth: boolean,
				bFixBoundaries: boolean,
				coordinateSystem: any,
				multiple?: boolean
			): Promise<any>;
			smooth1(
				mesh: any,
				smoothFactor: number,
				bXSmooth: boolean,
				bYSmooth: boolean,
				bZSmooth: boolean,
				bFixBoundaries: boolean,
				coordinateSystem: any,
				plane: any,
				multiple?: boolean
			): Promise<any>;
			smooth2(
				mesh: any,
				vertexIndices: number[],
				smoothFactor: number,
				bXSmooth: boolean,
				bYSmooth: boolean,
				bZSmooth: boolean,
				bFixBoundaries: boolean,
				coordinateSystem: any,
				plane: any,
				multiple?: boolean
			): Promise<any>;
			unweld(
				mesh: any,
				angleToleranceRadians: number,
				modifyNormals: boolean,
				multiple?: boolean
			): Promise<any>;
			unweldEdge(
				mesh: any,
				edgeIndices: number[],
				modifyNormals: boolean,
				multiple?: boolean
			): Promise<any>;
			unweldVertices(
				mesh: any,
				topologyVertexIndices: number[],
				modifyNormals: boolean,
				multiple?: boolean
			): Promise<any>;
			weld(mesh: any, angleToleranceRadians: number, multiple?: boolean): Promise<any>;
			rebuildNormals(mesh: any, multiple?: boolean): Promise<any>;
			extractNonManifoldEdges(mesh: any, selective: boolean, multiple?: boolean): Promise<any>;
			healNakedEdges(mesh: any, distance: number, multiple?: boolean): Promise<any>;
			fillHoles(mesh: any, multiple?: boolean): Promise<any>;
			fileHole(mesh: any, topologyEdgeIndex: number, multiple?: boolean): Promise<any>;
			unifyNormals(mesh: any, multiple?: boolean): Promise<any>;
			unifyNormals1(mesh: any, countOnly: boolean, multiple?: boolean): Promise<any>;
			splitDisjointPieces(mesh: any, multiple?: boolean): Promise<any>;
			split(mesh: any, plane: any, multiple?: boolean): Promise<any>;
			split1(_mesh: any, mesh: any, multiple?: boolean): Promise<any>;
			split2(mesh: any, meshes: any, multiple?: boolean): Promise<any>;
			split3(
				mesh: any,
				meshes: any,
				tolerance: number,
				splitAtCoplanar: boolean,
				textLog: any,
				cancel: any,
				progress: any,
				multiple?: boolean
			): Promise<any>;
			split4(
				mesh: any,
				meshes: any,
				tolerance: number,
				splitAtCoplanar: boolean,
				createNgons: boolean,
				textLog: any,
				cancel: any,
				progress: any,
				multiple?: boolean
			): Promise<any>;
			getOutlines(mesh: any, plane: any, multiple?: boolean): Promise<any>;
			getOutlines1(mesh: any, viewport: any, multiple?: boolean): Promise<any>;
			getOutlines2(mesh: any, viewportInfo: any, plane: any, multiple?: boolean): Promise<any>;
			getNakedEdges(mesh: any, multiple?: boolean): Promise<any>;
			explodeAtUnweldedEdges(mesh: any, multiple?: boolean): Promise<any>;
			closestPoint(mesh: any, testPoint: any, multiple?: boolean): Promise<any>;
			closestMeshPoint(
				mesh: any,
				testPoint: any,
				maximumDistance: number,
				multiple?: boolean
			): Promise<any>;
			closestPoint1(
				mesh: any,
				testPoint: any,
				maximumDistance: number,
				multiple?: boolean
			): Promise<any>;
			closestPoint2(
				mesh: any,
				testPoint: any,
				maximumDistance: number,
				multiple?: boolean
			): Promise<any>;
			pointAt(mesh: any, meshPoint: any, multiple?: boolean): Promise<any>;
			pointAt1(
				mesh: any,
				faceIndex: number,
				t0: number,
				t1: number,
				t2: number,
				t3: number,
				multiple?: boolean
			): Promise<any>;
			normalAt(mesh: any, meshPoint: any, multiple?: boolean): Promise<any>;
			normalAt1(
				mesh: any,
				faceIndex: number,
				t0: number,
				t1: number,
				t2: number,
				t3: number,
				multiple?: boolean
			): Promise<any>;
			colorAt(mesh: any, meshPoint: any, multiple?: boolean): Promise<any>;
			colorAt1(
				mesh: any,
				faceIndex: number,
				t0: number,
				t1: number,
				t2: number,
				t3: number,
				multiple?: boolean
			): Promise<any>;
			pullPointsToMesh(mesh: any, points: any, multiple?: boolean): Promise<any>;
			pullCurve(mesh: any, curve: any, tolerance: number, multiple?: boolean): Promise<any>;
			splitWithProjectedPolylines(
				mesh: any,
				curves: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			splitWithProjectedPolylines1(
				mesh: any,
				curves: any,
				tolerance: number,
				textLog: any,
				cancel: any,
				progress: any,
				multiple?: boolean
			): Promise<any>;
			offset(mesh: any, distance: number, multiple?: boolean): Promise<any>;
			offset1(mesh: any, distance: number, solidify: boolean, multiple?: boolean): Promise<any>;
			offset2(
				mesh: any,
				distance: number,
				solidify: boolean,
				direction: any,
				multiple?: boolean
			): Promise<any>;
			offset3(
				mesh: any,
				distance: number,
				solidify: boolean,
				direction: any,
				multiple?: boolean
			): Promise<any>;
			collapseFacesByEdgeLength(
				mesh: any,
				bGreaterThan: boolean,
				edgeLength: number,
				multiple?: boolean
			): Promise<any>;
			collapseFacesByArea(
				mesh: any,
				lessThanArea: number,
				greaterThanArea: number,
				multiple?: boolean
			): Promise<any>;
			collapseFacesByByAspectRatio(
				mesh: any,
				aspectRatio: number,
				multiple?: boolean
			): Promise<any>;
			getUnsafeLock(mesh: any, writable: boolean, multiple?: boolean): Promise<any>;
			releaseUnsafeLock(mesh: any, meshData: any, multiple?: boolean): Promise<any>;
			withShutLining(
				mesh: any,
				faceted: boolean,
				tolerance: number,
				curves: any,
				multiple?: boolean
			): Promise<any>;
			withDisplacement(mesh: any, displacement: any, multiple?: boolean): Promise<any>;
			withEdgeSoftening(
				mesh: any,
				softeningRadius: number,
				chamfer: boolean,
				faceted: boolean,
				force: boolean,
				angleThreshold: number,
				multiple?: boolean
			): Promise<any>;
			quadRemeshBrep(brep: any, parameters: any, multiple?: boolean): Promise<any>;
			quadRemeshBrep1(
				brep: any,
				parameters: any,
				guideCurves: any,
				multiple?: boolean
			): Promise<any>;
			quadRemeshBrepAsync(
				brep: any,
				parameters: any,
				progress: any,
				cancelToken: any,
				multiple?: boolean
			): Promise<any>;
			quadRemeshBrepAsync1(
				brep: any,
				parameters: any,
				guideCurves: any,
				progress: any,
				cancelToken: any,
				multiple?: boolean
			): Promise<any>;
			quadRemesh(mesh: any, parameters: any, multiple?: boolean): Promise<any>;
			quadRemesh1(mesh: any, parameters: any, guideCurves: any, multiple?: boolean): Promise<any>;
			quadRemeshAsync(
				mesh: any,
				parameters: any,
				progress: any,
				cancelToken: any,
				multiple?: boolean
			): Promise<any>;
			quadRemeshAsync1(
				mesh: any,
				parameters: any,
				guideCurves: any,
				progress: any,
				cancelToken: any,
				multiple?: boolean
			): Promise<any>;
			quadRemeshAsync2(
				mesh: any,
				faceBlocks: number[],
				parameters: any,
				guideCurves: any,
				progress: any,
				cancelToken: any,
				multiple?: boolean
			): Promise<any>;
			reduce(
				mesh: any,
				desiredPolygonCount: number,
				allowDistortion: boolean,
				accuracy: number,
				normalizeSize: boolean,
				multiple?: boolean
			): Promise<any>;
			reduce1(
				mesh: any,
				desiredPolygonCount: number,
				allowDistortion: boolean,
				accuracy: number,
				normalizeSize: boolean,
				threaded: boolean,
				multiple?: boolean
			): Promise<any>;
			reduce2(
				mesh: any,
				desiredPolygonCount: number,
				allowDistortion: boolean,
				accuracy: number,
				normalizeSize: boolean,
				cancelToken: any,
				progress: any,
				multiple?: boolean
			): Promise<any>;
			reduce3(
				mesh: any,
				desiredPolygonCount: number,
				allowDistortion: boolean,
				accuracy: number,
				normalizeSize: boolean,
				cancelToken: any,
				progress: any,
				threaded: boolean,
				multiple?: boolean
			): Promise<any>;
			reduce4(mesh: any, parameters: any, multiple?: boolean): Promise<any>;
			reduce5(mesh: any, parameters: any, threaded: boolean, multiple?: boolean): Promise<any>;
			computeThickness(meshes: any, maximumThickness: number, multiple?: boolean): Promise<any>;
			computeThickness1(
				meshes: any,
				maximumThickness: number,
				cancelToken: any,
				multiple?: boolean
			): Promise<any>;
			computeThickness2(
				meshes: any,
				maximumThickness: number,
				sharpAngle: number,
				cancelToken: any,
				multiple?: boolean
			): Promise<any>;
			createContourCurves(
				meshToContour: any,
				contourStart: any,
				contourEnd: any,
				interval: number,
				multiple?: boolean
			): Promise<any>;
			createContourCurves1(meshToContour: any, sectionPlane: any, multiple?: boolean): Promise<any>;
		};

		NurbsCurve: {
			makeCompatible(
				curves: any,
				startPt: any,
				endPt: any,
				simplifyMethod: number,
				numPoints: number,
				refitTolerance: number,
				angleTolerance: number,
				multiple?: boolean
			): Promise<any>;
			createParabolaFromVertex(
				vertex: any,
				startPoint: any,
				endPoint: any,
				multiple?: boolean
			): Promise<any>;
			createParabolaFromFocus(
				focus: any,
				startPoint: any,
				endPoint: any,
				multiple?: boolean
			): Promise<any>;
			createFromArc(arc: any, degree: number, cvCount: number, multiple?: boolean): Promise<any>;
			createHSpline(points: any, multiple?: boolean): Promise<any>;
			createHSpline1(
				points: any,
				startTangent: any,
				endTangent: any,
				multiple?: boolean
			): Promise<any>;
			createSubDFriendly(
				points: any,
				interpolatePoints: boolean,
				periodicClosedCurve: boolean,
				multiple?: boolean
			): Promise<any>;
			createSubDFriendly1(curve: any, multiple?: boolean): Promise<any>;
			createSubDFriendly2(
				curve: any,
				pointCount: number,
				periodicClosedCurve: boolean,
				multiple?: boolean
			): Promise<any>;
			createPlanarRailFrames(
				nurbscurve: any,
				parameters: number[],
				normal: any,
				multiple?: boolean
			): Promise<any>;
			createRailFrames(nurbscurve: any, parameters: number[], multiple?: boolean): Promise<any>;
			createFromCircle(
				circle: any,
				degree: number,
				cvCount: number,
				multiple?: boolean
			): Promise<any>;
			setEndCondition(
				nurbscurve: any,
				bSetEnd: boolean,
				continuity: any,
				point: any,
				tangent: any,
				multiple?: boolean
			): Promise<any>;
			setEndCondition1(
				nurbscurve: any,
				bSetEnd: boolean,
				continuity: any,
				point: any,
				tangent: any,
				curvature: any,
				multiple?: boolean
			): Promise<any>;
			grevillePoints(nurbscurve: any, all: boolean, multiple?: boolean): Promise<any>;
			setGrevillePoints(nurbscurve: any, points: any, multiple?: boolean): Promise<any>;
			createSpiral(
				axisStart: any,
				axisDir: any,
				radiusPoint: any,
				pitch: number,
				turnCount: number,
				radius0: number,
				radius1: number,
				multiple?: boolean
			): Promise<any>;
			createSpiral1(
				railCurve: any,
				t0: number,
				t1: number,
				radiusPoint: any,
				pitch: number,
				turnCount: number,
				radius0: number,
				radius1: number,
				pointsPerTurn: number,
				multiple?: boolean
			): Promise<any>;
		};

		NurbsSurface: {
			createSubDFriendly(surface: any, multiple?: boolean): Promise<any>;
			createFromPlane(
				plane: any,
				uInterval: any,
				vInterval: any,
				uDegree: number,
				vDegree: number,
				uPointCount: number,
				vPointCount: number,
				multiple?: boolean
			): Promise<any>;
			createCurveOnSurfacePoints(
				surface: any,
				fixedPoints: any,
				tolerance: number,
				periodic: boolean,
				initCount: number,
				levels: number,
				multiple?: boolean
			): Promise<any>;
			createCurveOnSurface(
				surface: any,
				points: any,
				tolerance: number,
				periodic: boolean,
				multiple?: boolean
			): Promise<any>;
			makeCompatible(surface0: any, surface1: any, multiple?: boolean): Promise<any>;
			createFromPoints(
				points: any,
				uCount: number,
				vCount: number,
				uDegree: number,
				vDegree: number,
				multiple?: boolean
			): Promise<any>;
			createThroughPoints(
				points: any,
				uCount: number,
				vCount: number,
				uDegree: number,
				vDegree: number,
				uClosed: boolean,
				vClosed: boolean,
				multiple?: boolean
			): Promise<any>;
			createFromCorners(
				corner1: any,
				corner2: any,
				corner3: any,
				corner4: any,
				multiple?: boolean
			): Promise<any>;
			createFromCorners1(
				corner1: any,
				corner2: any,
				corner3: any,
				corner4: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createFromCorners2(
				corner1: any,
				corner2: any,
				corner3: any,
				multiple?: boolean
			): Promise<any>;
			createRailRevolvedSurface(
				profile: any,
				rail: any,
				axis: any,
				scaleHeight: boolean,
				multiple?: boolean
			): Promise<any>;
			createNetworkSurface(
				uCurves: any,
				uContinuityStart: number,
				uContinuityEnd: number,
				vCurves: any,
				vContinuityStart: number,
				vContinuityEnd: number,
				edgeTolerance: number,
				interiorTolerance: number,
				angleTolerance: number,
				multiple?: boolean
			): Promise<any>;
			createNetworkSurface1(
				curves: any,
				continuity: number,
				edgeTolerance: number,
				interiorTolerance: number,
				angleTolerance: number,
				multiple?: boolean
			): Promise<any>;
		};

		SubD: {
			toBrep(subd: any, options: any, multiple?: boolean): Promise<any>;
			createFromMesh(mesh: any, multiple?: boolean): Promise<any>;
			createFromMesh1(mesh: any, options: any, multiple?: boolean): Promise<any>;
			offset(subd: any, distance: number, solidify: boolean, multiple?: boolean): Promise<any>;
			createFromLoft(
				curves: any,
				closed: boolean,
				addCorners: boolean,
				addCreases: boolean,
				divisions: number,
				multiple?: boolean
			): Promise<any>;
			createFromSweep(
				rail1: any,
				shapes: any,
				closed: boolean,
				addCorners: boolean,
				roadlikeFrame: boolean,
				roadlikeNormal: any,
				multiple?: boolean
			): Promise<any>;
			createFromSweep1(
				rail1: any,
				rail2: any,
				shapes: any,
				closed: boolean,
				addCorners: boolean,
				multiple?: boolean
			): Promise<any>;
			interpolateSurfacePoints(subd: any, surfacePoints: any, multiple?: boolean): Promise<any>;
		};

		Surface: {
			createRollingBallFillet(
				surfaceA: any,
				surfaceB: any,
				radius: number,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createRollingBallFillet1(
				surfaceA: any,
				flipA: boolean,
				surfaceB: any,
				flipB: boolean,
				radius: number,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createRollingBallFillet2(
				surfaceA: any,
				uvA: any,
				surfaceB: any,
				uvB: any,
				radius: number,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			createExtrusion(profile: any, direction: any, multiple?: boolean): Promise<any>;
			createExtrusionToPoint(profile: any, apexPoint: any, multiple?: boolean): Promise<any>;
			createPeriodicSurface(surface: any, direction: number, multiple?: boolean): Promise<any>;
			createPeriodicSurface1(
				surface: any,
				direction: number,
				bSmooth: boolean,
				multiple?: boolean
			): Promise<any>;
			createSoftEditSurface(
				surface: any,
				uv: any,
				delta: any,
				uLength: number,
				vLength: number,
				tolerance: number,
				fixEnds: boolean,
				multiple?: boolean
			): Promise<any>;
			smooth(
				surface: any,
				smoothFactor: number,
				bXSmooth: boolean,
				bYSmooth: boolean,
				bZSmooth: boolean,
				bFixBoundaries: boolean,
				coordinateSystem: any,
				multiple?: boolean
			): Promise<any>;
			smooth1(
				surface: any,
				smoothFactor: number,
				bXSmooth: boolean,
				bYSmooth: boolean,
				bZSmooth: boolean,
				bFixBoundaries: boolean,
				coordinateSystem: any,
				plane: any,
				multiple?: boolean
			): Promise<any>;
			variableOffset(
				surface: any,
				uMinvMin: number,
				uMinvMax: number,
				uMaxvMin: number,
				uMaxvMax: number,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			variableOffset1(
				surface: any,
				uMinvMin: number,
				uMinvMax: number,
				uMaxvMin: number,
				uMaxvMax: number,
				interiorParameters: any,
				interiorDistances: number[],
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			getSurfaceSize(surface: any, multiple?: boolean): Promise<any>;
			closestSide(surface: any, u: number, v: number, multiple?: boolean): Promise<any>;
			extend(
				surface: any,
				edge: any,
				extensionLength: number,
				smooth: boolean,
				multiple?: boolean
			): Promise<any>;
			rebuild(
				surface: any,
				uDegree: number,
				vDegree: number,
				uPointCount: number,
				vPointCount: number,
				multiple?: boolean
			): Promise<any>;
			rebuildOneDirection(
				surface: any,
				direction: number,
				pointCount: number,
				loftType: any,
				refitTolerance: number,
				multiple?: boolean
			): Promise<any>;
			closestPoint(surface: any, testPoint: any, multiple?: boolean): Promise<any>;
			localClosestPoint(
				surface: any,
				testPoint: any,
				seedU: number,
				seedV: number,
				multiple?: boolean
			): Promise<any>;
			offset(surface: any, distance: number, tolerance: number, multiple?: boolean): Promise<any>;
			fit(
				surface: any,
				uDegree: number,
				vDegree: number,
				fitTolerance: number,
				multiple?: boolean
			): Promise<any>;
			interpolatedCurveOnSurfaceUV(
				surface: any,
				points: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			interpolatedCurveOnSurfaceUV1(
				surface: any,
				points: any,
				tolerance: number,
				closed: boolean,
				closedSurfaceHandling: number,
				multiple?: boolean
			): Promise<any>;
			interpolatedCurveOnSurface(
				surface: any,
				points: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			shortPath(
				surface: any,
				start: any,
				end: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			pushup(
				surface: any,
				curve2d: any,
				tolerance: number,
				curve2dSubdomain: any,
				multiple?: boolean
			): Promise<any>;
			pushup1(surface: any, curve2d: any, tolerance: number, multiple?: boolean): Promise<any>;
			pullback(surface: any, curve3d: any, tolerance: number, multiple?: boolean): Promise<any>;
			pullback1(
				surface: any,
				curve3d: any,
				tolerance: number,
				curve3dSubdomain: any,
				multiple?: boolean
			): Promise<any>;
		};

		Intersection: {
			curvePlane(curve: any, plane: any, tolerance: number, multiple?: boolean): Promise<any>;
			meshPlane(mesh: any, plane: any, multiple?: boolean): Promise<any>;
			meshPlane1(mesh: any, planes: any, multiple?: boolean): Promise<any>;
			brepPlane(brep: any, plane: any, tolerance: number, multiple?: boolean): Promise<any>;
			curveSelf(curve: any, tolerance: number, multiple?: boolean): Promise<any>;
			curveCurve(
				curveA: any,
				curveB: any,
				tolerance: number,
				overlapTolerance: number,
				multiple?: boolean
			): Promise<any>;
			curveCurveValidate(
				curveA: any,
				curveB: any,
				tolerance: number,
				overlapTolerance: number,
				multiple?: boolean
			): Promise<any>;
			curveLine(
				curve: any,
				line: any,
				tolerance: number,
				overlapTolerance: number,
				multiple?: boolean
			): Promise<any>;
			curveSurface(
				curve: any,
				surface: any,
				tolerance: number,
				overlapTolerance: number,
				multiple?: boolean
			): Promise<any>;
			curveSurfaceValidate(
				curve: any,
				surface: any,
				tolerance: number,
				overlapTolerance: number,
				multiple?: boolean
			): Promise<any>;
			curveSurface1(
				curve: any,
				curveDomain: any,
				surface: any,
				tolerance: number,
				overlapTolerance: number,
				multiple?: boolean
			): Promise<any>;
			curveSurfaceValidate1(
				curve: any,
				curveDomain: any,
				surface: any,
				tolerance: number,
				overlapTolerance: number,
				multiple?: boolean
			): Promise<any>;
			curveBrep(curve: any, brep: any, tolerance: number, multiple?: boolean): Promise<any>;
			curveBrep1(
				curve: any,
				brep: any,
				tolerance: number,
				angleTolerance: number,
				multiple?: boolean
			): Promise<any>;
			curveBrepFace(curve: any, face: any, tolerance: number, multiple?: boolean): Promise<any>;
			surfaceSurface(
				surfaceA: any,
				surfaceB: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			brepBrep(brepA: any, brepB: any, tolerance: number, multiple?: boolean): Promise<any>;
			brepSurface(brep: any, surface: any, tolerance: number, multiple?: boolean): Promise<any>;
			meshMeshFast(meshA: any, meshB: any, multiple?: boolean): Promise<any>;
			meshMeshAccurate(meshA: any, meshB: any, tolerance: number, multiple?: boolean): Promise<any>;
			meshRay(mesh: any, ray: any, multiple?: boolean): Promise<any>;
			meshRay1(mesh: any, ray: any, multiple?: boolean): Promise<any>;
			meshPolyline(mesh: any, curve: any, multiple?: boolean): Promise<any>;
			meshPolylineSorted(mesh: any, curve: any, multiple?: boolean): Promise<any>;
			meshLine(mesh: any, line: any, multiple?: boolean): Promise<any>;
			meshLineSorted(mesh: any, line: any, multiple?: boolean): Promise<any>;
			rayShoot(ray: any, geometry: any, maxReflections: number, multiple?: boolean): Promise<any>;
			rayShoot1(geometry: any, ray: any, maxReflections: number, multiple?: boolean): Promise<any>;
			projectPointsToMeshes(
				meshes: any,
				points: any,
				direction: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			projectPointsToMeshesEx(
				meshes: any,
				points: any,
				direction: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			projectPointsToBreps(
				breps: any,
				points: any,
				direction: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
			projectPointsToBrepsEx(
				breps: any,
				points: any,
				direction: any,
				tolerance: number,
				multiple?: boolean
			): Promise<any>;
		};

		Python: {
			pythonEvaluate(
				script: string,
				input: Record<string, any>,
				output: string[]
			): Record<string, any>;
		};
	}

	const RhinoCompute: RhinoComputeModule;
	export default RhinoCompute;
}
